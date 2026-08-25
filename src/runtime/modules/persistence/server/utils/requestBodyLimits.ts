/**
 * Size-limited request body reading (ingress control).
 *
 * The default h3 readers (readBody/readMultipartFormData) buffer the body in full
 * before any size check. Here a read is bounded twice over: the declared
 * Content-Length is refused before anything is read (a 413 for free), and the
 * stream is read under a hard limit and aborted the moment it is exceeded — the
 * header may be absent, or misreport the size under chunked transfer.
 *
 * Multipart forms are read by `multipartStream.ts`: their parts arrive as streams,
 * so the ceilings there are per part and per whole body, and the entrance has a
 * slot gate of its own.
 */
import { createError, getHeader, type H3Event } from 'h3';

/**
 * Human-readable size for the limit error messages.
 *
 * @param bytes - Size in bytes.
 * @returns A string such as "25MB" or "16KB".
 */
function formatByteSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${Math.floor(bytes / (1024 * 1024))}MB`;
    }

    return `${Math.ceil(bytes / 1024)}KB`;
}

/**
 * A 413 for exceeding the request body limit.
 *
 * @param maxBytes - The limit the read was performed under.
 * @returns h3 error with status 413.
 */
export function payloadTooLarge(maxBytes: number): Error {
    return createError({
        statusCode: 413,
        statusMessage: `Request body exceeds ${formatByteSize(maxBytes)} limit`,
    });
}

/**
 * Refuses a body whose DECLARED length is already above the ceiling — before a
 * single byte is read.
 *
 * The check is cheap and unconditional, but it is not a substitute for the limit
 * on the read itself: the header may be absent altogether, and under chunked
 * transfer it may lie.
 *
 * @param event - Request event.
 * @param maxBytes - Maximum body size.
 */
export function assertDeclaredLengthWithinLimit(event: H3Event, maxBytes: number): void {
    const declaredLength = Number(getHeader(event, 'content-length'));

    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw payloadTooLarge(maxBytes);
    }
}

/**
 * Reads an async iterable source of chunks under a hard limit: aborts the read
 * the moment it is exceeded, without buffering the remainder.
 *
 * @param source - Chunk source (Node request, generator).
 * @param maxBytes - Maximum total size.
 * @param buildLimitError - Factory of the limit error.
 * @returns Buffer holding what was read.
 */
export async function collectStreamWithLimit(
    source: AsyncIterable<Uint8Array>,
    maxBytes: number,
    buildLimitError: () => Error
): Promise<Buffer<ArrayBuffer>> {
    const chunks: Uint8Array[] = [];
    let total = 0;

    for await (const chunk of source) {
        total += chunk.byteLength;

        if (total > maxBytes) {
            throw buildLimitError();
        }

        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

/**
 * Adapter from a web ReadableStream to an AsyncIterable, canceling the stream
 * when the read is aborted early (exceeding the limit cancels the network
 * transfer as well).
 *
 * @param stream - Web stream (body of a fetch response).
 */
async function* iterateWebStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
    const reader = stream.getReader();
    let finished = false;

    try {
        for (;;) {
            const { done, value } = await reader.read();

            if (done) {
                finished = true;
                return;
            }

            yield value;
        }
    } finally {
        if (!finished) {
            await reader.cancel().catch(() => undefined);
        }

        reader.releaseLock();
    }
}

/**
 * Reads a web ReadableStream (body of a fetch response) under a hard size limit.
 *
 * @param stream - Web stream.
 * @param maxBytes - Maximum total size.
 * @param buildLimitError - Factory of the limit error.
 * @returns Buffer holding what was read.
 */
export async function collectWebStreamWithLimit(
    stream: ReadableStream<Uint8Array>,
    maxBytes: number,
    buildLimitError: () => Error
): Promise<Buffer<ArrayBuffer>> {
    return collectStreamWithLimit(iterateWebStream(stream), maxBytes, buildLimitError);
}

/**
 * Reads the raw request body under a limit: a pre-check of the declared
 * Content-Length (a 413 before reading), then a streaming read under the same
 * limit.
 *
 * @param event - Request event.
 * @param maxBytes - Maximum body size.
 * @returns Buffer holding the request body.
 */
async function readRawBodyWithLimit(
    event: H3Event,
    maxBytes: number
): Promise<Buffer<ArrayBuffer>> {
    assertDeclaredLengthWithinLimit(event, maxBytes);

    return collectStreamWithLimit(event.node.req, maxBytes, () => payloadTooLarge(maxBytes));
}

/**
 * Reads a JSON body under a size limit. An empty body gives null (validating
 * "the body is required" is up to the caller); invalid JSON gives a 400.
 *
 * @param event - Request event.
 * @param maxBytes - Maximum body size.
 * @returns The parsed body, or null.
 */
export async function readJsonBodyWithLimit<T>(
    event: H3Event,
    maxBytes: number
): Promise<T | null> {
    const buffer = await readRawBodyWithLimit(event, maxBytes);

    if (buffer.length === 0) {
        return null;
    }

    try {
        return JSON.parse(buffer.toString('utf8')) as T;
    } catch {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid JSON body',
        });
    }
}
