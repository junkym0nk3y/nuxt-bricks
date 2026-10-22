/**
 * Streaming reading of multipart/form-data (ingress control).
 *
 * The form is parsed as it arrives: a text field becomes a value, a file part
 * becomes a stream. Nothing waits for the whole body, so a video travels to
 * storage in pieces and only one piece lives in memory at a time — the previous
 * reader buffered the body in full and the parser copied it once more, which put
 * the peak of a single 100 MB upload at some 200 MB.
 *
 * Four independent barriers guard the entrance:
 *
 * - the declared Content-Length is refused before the body is touched (a free 413);
 * - every byte off the socket is counted, the envelope and the epilogue included,
 *   and the read is aborted the moment the body ceiling is passed (the header may
 *   be absent, or misreport the size under chunked transfer);
 * - a single file part, a single text field and the number of parts have ceilings
 *   of their own — a truncated part is a refusal, never a short file
 *   (`multipartParts.ts`);
 * - the number of forms read SIMULTANEOUSLY is capped by a slot gate: the
 *   endpoints' rate limits count requests, not their concurrency.
 */
import { Busboy } from '@fastify/busboy';
import { createError, getHeader, type H3Event } from 'h3';
import { createConcurrencyGate, GateOverflowError } from './concurrencyGate';
import {
    MAX_FIELD_BYTES,
    MAX_FIELDS,
    MAX_PARTS,
    createPartQueue,
    malformedMultipart,
    pumpRequestBody,
} from './multipartParts';
import { assertDeclaredLengthWithinLimit, payloadTooLarge } from './requestBodyLimits';
import type { IUploadedFilePart } from '../../types/media';
import type { IMultipartForm, IMultipartReadLimits } from '../../types/multipartStream';

/**
 * Headroom for the multipart envelope (boundaries, part headers, text fields) on
 * top of the file payload limit.
 */
export const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = 1024 * 1024;

/**
 * How many forms the server agrees to read at the same time.
 *
 * The endpoints' rate limits count requests per minute, not their concurrency:
 * everything they allow may arrive at once. The number is deliberately the same
 * as the concurrency of the sharp semaphore — an image upload occupies both, and
 * a wider entrance would only build a queue in front of the narrower gate. Four
 * videos hold four part buffers, four images hold four input buffers plus what
 * sharp decodes; that is the memory this number buys.
 */
const MAX_INFLIGHT_MULTIPART_READS = 4;

/**
 * The slot gate shared by every multipart endpoint: they share the memory. No
 * waiting queue — a request that found the entrance busy is refused at once
 * rather than holding a connection open for its turn.
 */
const multipartIngressGate = createConcurrencyGate({
    maxConcurrent: MAX_INFLIGHT_MULTIPART_READS,
    maxQueue: 0,
});

/** RFC 2046 caps a multipart boundary at 70 characters. */
const MAX_BOUNDARY_LENGTH = 70;

/** The boundary parameter of a multipart Content-Type. */
const BOUNDARY_PATTERN = /;\s*boundary=(?:"([^"]*)"|([^\s;]+))/i;

/**
 * A 503 for finding every ingress slot occupied.
 *
 * Not a 429: the client has not exhausted a request quota, it is the server that
 * is busy, and the same request is worth repeating a little later.
 *
 * @returns h3 error with status 503.
 */
function tooManyInflightForms(): Error {
    return createError({
        statusCode: 503,
        statusMessage: 'Server is busy receiving uploads, try again later',
    });
}

/**
 * Checks that the request carries a multipart form with a usable boundary.
 *
 * The boundary is checked here rather than left to the parser for two reasons: a
 * missing one must answer 400 instead of a generic failure, and an absurdly long
 * one is refused by the RFC ceiling before it becomes the parser's problem.
 *
 * @param contentType - The request's Content-Type header.
 */
function assertMultipartRequest(contentType: string): void {
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
        throw malformedMultipart('Expected multipart/form-data request');
    }

    const boundary = BOUNDARY_PATTERN.exec(contentType);
    const value = boundary?.[1] ?? boundary?.[2] ?? '';

    if (!value) {
        throw malformedMultipart('Multipart boundary is missing');
    }

    if (value.length > MAX_BOUNDARY_LENGTH) {
        throw malformedMultipart('Multipart boundary is too long');
    }
}

/**
 * The signal of the client going away: the body was cut short, or the connection
 * closed while the response was still being prepared.
 *
 * Storage gets this signal so that a request in flight stops instead of finishing
 * an upload nobody will hear about. The request's own `close` is not enough by
 * itself — it fires on a healthy request too, which is why `complete` decides.
 *
 * @param event - Request event.
 * @returns The signal and the removal of its listeners.
 */
function watchClientDeparture(event: H3Event): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const { req, res } = event.node;

    const abortOnIncompleteBody = (): void => {
        if (!req.complete) {
            controller.abort(new Error('Client closed the request before the body ended'));
        }
    };
    const abortOnClosedResponse = (): void => {
        if (!res.writableEnded) {
            controller.abort(new Error('Client closed the connection before the response'));
        }
    };

    req.on('close', abortOnIncompleteBody);
    res.on('close', abortOnClosedResponse);

    return {
        signal: controller.signal,
        dispose: (): void => {
            req.off('close', abortOnIncompleteBody);
            res.off('close', abortOnClosedResponse);
        },
    };
}

/**
 * Reads a multipart form as a stream and hands it to a handler, HOLDING an
 * ingress slot until the handling is over.
 *
 * The form is handed to a callback rather than returned precisely because of the
 * slot: the bytes of a part live exactly as long as the handler runs — a file
 * goes through sharp or into storage while it is being read. Whatever happens
 * after the form is read (registering a record in the database, say) belongs
 * OUTSIDE the callback: an external write must not occupy the entrance.
 *
 * The read ceiling cannot vary by file type: what a part is becomes known only
 * when it starts. The caller therefore sets one ceiling per endpoint, by the
 * largest file it may accept, and narrows it per part itself — `collect` takes a
 * ceiling of its own, and a streamed part is bounded by whoever pipes it.
 *
 * @param event - Request event.
 * @param limits - The ceilings of the body, of one file part and the slot gate.
 * @param use - Handler of the form; its result is returned to the caller.
 * @returns Result of the handler.
 */
export async function withMultipartParts<T>(
    event: H3Event,
    limits: IMultipartReadLimits,
    use: (form: IMultipartForm) => Promise<T>
): Promise<T> {
    const contentType = getHeader(event, 'content-type') ?? '';

    assertMultipartRequest(contentType);
    assertDeclaredLengthWithinLimit(event, limits.maxBodyBytes);

    const gate = limits.gate ?? multipartIngressGate;

    try {
        return await gate.run(async () => {
            const { req } = event.node;
            const parser = new Busboy({
                headers: { ...req.headers, 'content-type': contentType },
                limits: {
                    fieldSize: MAX_FIELD_BYTES,
                    fields: MAX_FIELDS,
                    fileSize: limits.maxFileBytes,
                    files: 1,
                    parts: MAX_PARTS,
                },
            });
            const queue = createPartQueue(parser, limits.maxFileBytes);
            const departure = watchClientDeparture(event);
            const teardown = new AbortController();
            // The pump runs alongside the handler rather than before it: the
            // handler reads the parts the pump produces. Its refusal travels to the
            // handler through the same queue as the parser's own, so the promise
            // itself never rejects and nobody has to hold it
            pumpRequestBody(req, parser, limits.maxBodyBytes, teardown.signal).catch(
                (error: unknown) => queue.fail(error)
            );

            try {
                return await use({ parts: queue.parts, signal: departure.signal });
            } finally {
                departure.dispose();
                // The pump is told to stop and is NOT waited for. A handler that
                // refused the form leaves its part unread, and the parser will
                // never take the chunk the pump is holding — waiting here would
                // hang the answer instead of sending it. The request itself is
                // left alone on purpose: destroying it takes the socket with it,
                // and the refusal would never reach the client. Node closes a
                // connection whose body was not read to the end by itself, once
                // the response has gone out
                teardown.abort();
                parser.destroy();
            }
        });
    } catch (error: unknown) {
        if (error instanceof GateOverflowError) {
            throw tooManyInflightForms();
        }

        throw error;
    }
}

/**
 * Reads a multipart form into memory in full and hands the parts to a handler.
 *
 * For the endpoints whose every part is small and needed as bytes anyway (a photo
 * to crop, a canvas snapshot to re-encode): the form arrives as the same array of
 * parts a buffered reader used to return, only nothing is copied twice any more.
 * `maxBytes` bounds BOTH the body on the wire and what is collected in memory.
 *
 * @param event - Request event.
 * @param maxBytes - Maximum size of the form.
 * @param use - Handler of the parts; its result is returned to the caller.
 * @returns Result of the handler.
 */
export async function withMultipartFormData<T>(
    event: H3Event,
    maxBytes: number,
    use: (parts: IUploadedFilePart[]) => Promise<T>
): Promise<T> {
    return withMultipartParts(
        event,
        { maxBodyBytes: maxBytes, maxFileBytes: maxBytes },
        async (form) => {
            const parts: IUploadedFilePart[] = [];
            let remaining = maxBytes;

            for await (const part of form.parts) {
                if (part.kind === 'field') {
                    const data = Buffer.from(part.value, 'utf8');

                    if (data.byteLength > remaining) {
                        throw payloadTooLarge(maxBytes);
                    }

                    remaining -= data.byteLength;
                    parts.push({ name: part.name, data });
                    continue;
                }

                const data = await part.collect(remaining);

                remaining -= data.byteLength;
                parts.push({
                    name: part.name,
                    filename: part.filename,
                    type: part.type,
                    data,
                });
            }

            return use(parts);
        }
    );
}
