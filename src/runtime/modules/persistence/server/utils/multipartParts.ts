/**
 * The bridge between the multipart parser (an event emitter) and an async loop
 * over the form's parts.
 *
 * The entrance policy — the ceilings, the slots, what is refused before the body
 * is touched — lives in `multipartStream.ts`; here is the plumbing it stands on:
 * the queue of parts, the one-shot bytes of a file part and the pump that feeds
 * the parser under a byte count and an idle bound.
 */
import type { BusboyFileStream, BusboyInstance } from '@fastify/busboy';
import { createError } from 'h3';
import type { IncomingMessage } from 'node:http';
import { collectStreamWithLimit, payloadTooLarge } from './requestBodyLimits';
import type {
    IMultipartFilePart,
    IMultipartPartQueue,
    IMultipartQueuedPart,
    TMultipartPart,
} from '../../types/multipartStream';

/** The ceiling of one text field's value (the fields carry slugs and numbers). */
export const MAX_FIELD_BYTES = 64 * 1024;

/** How many text fields one form may carry. */
export const MAX_FIELDS = 16;

/** How many parts in total (fields plus files) one form may carry. */
export const MAX_PARTS = 24;

/**
 * What the parser puts on a file part that carried no Content-Type of its own.
 *
 * The callers tell "the client declared nothing" from a declared type — the
 * routing by kind and the length check of the MIME both read it — so the parser's
 * own default must not travel on as if the client had sent it.
 */
const PARSER_DEFAULT_PART_MIME = 'text/plain';

/**
 * How long the client may stay silent while a chunk of the body is awaited.
 *
 * The timeout measures OUR waiting for the client, not the gap between chunks: a
 * pause while a part travels to storage is the server being busy, and cutting the
 * upload off for it would kill a healthy transfer. Without the bound a handful of
 * clients dribbling a byte a minute would hold every ingress slot for as long as
 * they liked.
 */
const BODY_IDLE_TIMEOUT_MS = 30_000;

/**
 * A 400 for a form the parser cannot read.
 *
 * @param reason - What exactly is wrong (reaches the client).
 * @returns h3 error with status 400.
 */
export function malformedMultipart(reason: string): Error {
    return createError({
        statusCode: 400,
        statusMessage: reason,
    });
}

/**
 * Reads the file part's bytes, turning a part cut short by the size limit into a
 * refusal.
 *
 * The parser does not fail on its own when `fileSize` is reached: it ends the
 * stream and marks it truncated. Without this check a file cut in the middle
 * would look like a complete one and would go into storage as a valid object.
 *
 * @param stream - The parser's stream of the part.
 * @param maxFileBytes - The ceiling the part was read under (for the message).
 */
async function* iterateFilePart(
    stream: BusboyFileStream,
    maxFileBytes: number
): AsyncGenerator<Uint8Array> {
    for await (const chunk of stream) {
        if (stream.truncated) {
            throw payloadTooLarge(maxFileBytes);
        }

        yield chunk;
    }

    if (stream.truncated) {
        throw payloadTooLarge(maxFileBytes);
    }
}

/**
 * Wraps the parser's stream into a part with one-shot bytes.
 *
 * The bytes may be taken once — as a stream or into a buffer: the source is the
 * network, so a second reader would silently get nothing instead of a copy.
 *
 * @param name - The field name of the part.
 * @param stream - The parser's stream of the part.
 * @param filename - The client's file name.
 * @param mimeType - The declared Content-Type of the part.
 * @param maxFileBytes - The ceiling of the part.
 * @returns The file part.
 */
function createFilePart(
    name: string,
    stream: BusboyFileStream,
    filename: string,
    mimeType: string,
    maxFileBytes: number
): IMultipartFilePart {
    let taken = false;

    const takeBytes = (): AsyncGenerator<Uint8Array> => {
        if (taken) {
            throw new Error('Multipart file part can be read only once');
        }

        taken = true;

        return iterateFilePart(stream, maxFileBytes);
    };

    return {
        kind: 'file',
        name,
        filename,
        type: mimeType && mimeType !== PARSER_DEFAULT_PART_MIME ? mimeType : undefined,
        chunks: takeBytes,
        collect: (maxBytes: number): Promise<Buffer> =>
            collectStreamWithLimit(takeBytes(), maxBytes, () => payloadTooLarge(maxBytes)),
    };
}

/**
 * The queue of parsed parts: the parser pushes, the consumer pulls.
 *
 * A queue rather than direct handing over because the parser is an event emitter
 * and the consumer is an async loop. The consumer sees the parts in wire order,
 * the first refusal wins (a later parser error must not replace the reason the
 * read stopped), and the iteration ends only when the parser has finished the
 * form: a broken tail behind a perfectly good file part still reaches the
 * consumer as an error.
 *
 * @param parser - The multipart parser.
 * @param maxFileBytes - The ceiling of one file part.
 * @returns The parts as an async iterable, plus the failure entry point.
 */
export function createPartQueue(parser: BusboyInstance, maxFileBytes: number): IMultipartPartQueue {
    const pending: IMultipartQueuedPart[] = [];
    let failure: unknown = null;
    let finished = false;
    let wake: (() => void) | null = null;
    let activeFile: BusboyFileStream | null = null;

    const notify = (): void => {
        const resume = wake;
        wake = null;
        resume?.();
    };

    const fail = (error: unknown): void => {
        if (!failure) {
            failure = error;

            // The consumer may be in the middle of the part's bytes: without
            // destroying the stream it would wait for a continuation the parser
            // will never write. A part already read to its end is left alone —
            // and the listener of its own is mandatory, because a stream nobody
            // iterates any more turns a destroy with an error into an uncaught
            // exception that takes the process with it
            if (activeFile && !activeFile.readableEnded && !activeFile.destroyed) {
                activeFile.on('error', (): void => undefined);
                activeFile.destroy(error instanceof Error ? error : new Error(String(error)));
            }
        }

        notify();
    };

    parser.on('field', (name, value, nameTruncated, valueTruncated): void => {
        if (nameTruncated || valueTruncated) {
            fail(payloadTooLarge(MAX_FIELD_BYTES));

            return;
        }

        pending.push({ part: { kind: 'field', name, value }, stream: null });
        notify();
    });

    parser.on('file', (name, stream, filename, _transferEncoding, mimeType): void => {
        activeFile = stream;
        pending.push({
            part: createFilePart(name, stream, filename ?? '', mimeType, maxFileBytes),
            stream,
        });
        notify();
    });

    parser.on('error', (error: unknown): void => {
        console.warn('[Multipart] Parser refused the body:', error);
        fail(malformedMultipart('Malformed multipart/form-data body'));
    });

    parser.on('partsLimit', (): void => fail(malformedMultipart('Too many parts in the form')));
    parser.on('filesLimit', (): void => fail(malformedMultipart('Too many files in the form')));
    parser.on('fieldsLimit', (): void => fail(malformedMultipart('Too many fields in the form')));

    parser.on('finish', (): void => {
        finished = true;
        notify();
    });

    async function* iterate(): AsyncGenerator<TMultipartPart> {
        for (;;) {
            if (failure) {
                throw failure;
            }

            const next = pending.shift();

            if (next) {
                yield next.part;

                // Advancing over the part JUST HANDED OVER while its bytes are
                // still coming would stall the parser: it writes into that very
                // stream. The caller has to consume a file part or refuse the
                // request — draining it here would mean receiving a file nobody
                // asked for
                if (next.stream && !next.stream.readableEnded && !next.stream.destroyed) {
                    throw new Error('Previous multipart file part was left unread');
                }

                continue;
            }

            if (finished) {
                return;
            }

            await new Promise<void>((resolve) => {
                wake = resolve;
            });
        }
    }

    return { parts: iterate(), fail };
}

/**
 * Hands one chunk to the parser, waiting for it to be taken.
 *
 * The write callback is what carries the backpressure: it fires once the parser
 * has passed the chunk on, so a part nobody reads yet stops the socket instead of
 * piling up in memory. Which is also why the wait must be interruptible — a
 * handler that refused the form leaves its part unread, and the callback for that
 * chunk is then never going to fire.
 *
 * @param parser - The multipart parser.
 * @param chunk - The bytes to hand over.
 * @param stopped - Torn down: the wait ends with a refusal instead of hanging.
 */
async function writeChunkToParser(
    parser: BusboyInstance,
    chunk: Uint8Array,
    stopped: AbortSignal
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const abort = (): void => reject(new Error('Multipart read was torn down'));

        if (stopped.aborted) {
            abort();

            return;
        }

        stopped.addEventListener('abort', abort, { once: true });
        parser.write(chunk, (error): void => {
            stopped.removeEventListener('abort', abort);

            if (error) {
                reject(error);

                return;
            }

            resolve();
        });
    });
}

/**
 * Pumps the request body into the parser, counting every byte and bounding the
 * silence of the client.
 *
 * @param req - The request stream.
 * @param parser - The multipart parser.
 * @param maxBodyBytes - The ceiling of the whole body.
 * @param stopped - Torn down: the pump stops without a verdict about the body.
 */
export async function pumpRequestBody(
    req: IncomingMessage,
    parser: BusboyInstance,
    maxBodyBytes: number,
    stopped: AbortSignal
): Promise<void> {
    const chunks = req[Symbol.asyncIterator]();
    let total = 0;

    for (;;) {
        // The timeout destroys the request rather than answering 408: a client
        // that has gone silent mid-body is not going to read an answer anyway, and
        // what matters is freeing the ingress slot it holds
        const idleTimer = setTimeout((): void => {
            req.destroy(createError({ statusCode: 408, statusMessage: 'Request body timed out' }));
        }, BODY_IDLE_TIMEOUT_MS);

        let step: IteratorResult<Uint8Array>;

        try {
            step = await chunks.next();
        } finally {
            clearTimeout(idleTimer);
        }

        if (step.done || stopped.aborted) {
            break;
        }

        total += step.value.byteLength;

        if (total > maxBodyBytes) {
            throw payloadTooLarge(maxBodyBytes);
        }

        await writeChunkToParser(parser, step.value, stopped);
    }

    // A read torn down says nothing about the body: the verdicts below belong to a
    // read that ran to its end
    if (stopped.aborted) {
        return;
    }

    // A body that ended without its last byte is not an empty form but a cut-off
    // one: handing it to the parser as a clean end would let a truncated upload
    // through wherever the closing boundary happened to land
    if (!req.complete) {
        throw malformedMultipart('Request body was not fully received');
    }

    parser.end();
}
