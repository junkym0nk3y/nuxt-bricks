/**
 * Size-limited request body reading (ingress control).
 *
 * The default h3 readers (readBody/readMultipartFormData) buffer the body in
 * full before any size check. Three independent barriers here: the declared
 * Content-Length is checked before reading (a 413 for free), the stream is read
 * under a hard limit and aborted the moment it is exceeded (the header may be
 * absent, or misreport the size under chunked transfer), and the total size of
 * the forms buffered SIMULTANEOUSLY is capped by a budget.
 */
import { createError, getHeader, type H3Event } from 'h3';
import type { IUploadedFilePart } from '../../types/media';
import type { IBodyReservation, IInflightBodyBudget } from '../../types/requestBodyLimits';

/**
 * Headroom for the multipart envelope (boundaries, part headers, text fields) on
 * top of the file payload limit.
 */
export const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = 1024 * 1024;

/**
 * Ceiling on the total size of the multipart forms the server agrees to hold in
 * memory at the same time.
 *
 * The endpoint rate limit counts requests, not their concurrency: the thirty
 * uploads per minute it allows may all arrive at once, and every body is
 * assembled in memory in full. 256 MB admits two maximum-size video uploads, or
 * hundreds of images; past that the request is rejected outright, without
 * starting to read the body.
 *
 * The budget counts the DECLARED body size (and the whole ceiling when the
 * header is absent — see the reservation below), not peak memory: parsing the
 * form copies the body once more, so the real peak is up to two budgets.
 * Counting that copy inside the reservation itself would halve throughput for
 * the same order of magnitude.
 */
const INFLIGHT_MULTIPART_BUDGET_BYTES = 256 * 1024 * 1024;

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
function payloadTooLarge(maxBytes: number): Error {
    return createError({
        statusCode: 413,
        statusMessage: `Request body exceeds ${formatByteSize(maxBytes)} limit`,
    });
}

/**
 * A 503 for overflowing the concurrent buffering budget.
 *
 * Not a 429: the client has not exhausted a request quota, it is the server that
 * is busy, and the same request is worth repeating a little later.
 *
 * @returns h3 error with status 503.
 */
function tooManyInflightBodies(): Error {
    return createError({
        statusCode: 503,
        statusMessage: 'Server is busy receiving uploads, try again later',
    });
}

/**
 * Creates a budget for buffering bodies concurrently.
 *
 * @param maxBytes - Total ceiling.
 * @returns The budget.
 */
export function createInflightBodyBudget(maxBytes: number): IInflightBodyBudget {
    let usedBytes = 0;

    return {
        reserve(bytes: number): () => void {
            // A lone request always gets through, even when it alone is larger
            // than the budget: otherwise a configuration whose file ceiling
            // exceeds the budget would reject every upload, meaning the endpoint
            // would not work at all
            if (usedBytes > 0 && usedBytes + bytes > maxBytes) {
                throw tooManyInflightBodies();
            }

            usedBytes += bytes;
            let released = false;

            return () => {
                // Idempotent: releasing twice would return bytes to the budget
                // that are not there, and the ceiling would drift upwards
                // for good
                if (released) {
                    return;
                }

                released = true;
                usedBytes -= bytes;
            };
        },
    };
}

/** One budget shared by every multipart endpoint: they share the memory. */
const inflightMultipartBudget = createInflightBodyBudget(INFLIGHT_MULTIPART_BUDGET_BYTES);

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
 * Adapter from a web ReadableStream to an AsyncIterable, cancelling the stream
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
 * Checks the declared Content-Length and reserves room for the body in the
 * budget.
 *
 * The reservation goes by the declared length and the read goes by the
 * reservation: otherwise a client declaring one byte and sending a hundred
 * megabytes chunked would slip past the budget — we would have agreed to read up
 * to the endpoint's full ceiling having reserved a single byte. With no header at
 * all the whole ceiling is reserved, that is, the worst case.
 *
 * @param event - Request event.
 * @param maxBytes - Maximum body size.
 * @param budget - Concurrent buffering budget; without it nothing is reserved.
 * @returns The read ceiling and the release of the reservation.
 */
function reserveRequestBody(
    event: H3Event,
    maxBytes: number,
    budget?: IInflightBodyBudget
): IBodyReservation {
    const declaredLength = Number(getHeader(event, 'content-length'));
    const hasDeclaredLength = Number.isFinite(declaredLength) && declaredLength >= 0;

    if (hasDeclaredLength && declaredLength > maxBytes) {
        throw payloadTooLarge(maxBytes);
    }

    if (!budget) {
        return { limitBytes: maxBytes, release: (): void => undefined };
    }

    const reservedBytes = hasDeclaredLength ? declaredLength : maxBytes;

    return { limitBytes: reservedBytes, release: budget.reserve(reservedBytes) };
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
    const { limitBytes } = reserveRequestBody(event, maxBytes);

    return collectStreamWithLimit(event.node.req, limitBytes, () => payloadTooLarge(maxBytes));
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

/**
 * Parses multipart/form-data out of a buffer with the standard undici parser
 * (Response.formData). File parts carry filename and type, text parts carry data
 * only.
 *
 * @param buffer - Raw request body.
 * @param contentType - Content-Type header with the boundary.
 * @returns Parts of the form.
 */
export async function parseMultipartBuffer(
    buffer: Uint8Array<ArrayBuffer>,
    contentType: string
): Promise<IUploadedFilePart[]> {
    let formData: FormData;

    try {
        formData = await new Response(buffer, {
            headers: { 'content-type': contentType },
        }).formData();
    } catch {
        throw createError({
            statusCode: 400,
            statusMessage: 'Malformed multipart/form-data body',
        });
    }

    const parts: IUploadedFilePart[] = [];

    for (const [name, value] of formData.entries()) {
        if (typeof value === 'string') {
            parts.push({ name, data: Buffer.from(value) });
            continue;
        }

        parts.push({
            name,
            filename: value.name,
            type: value.type || undefined,
            data: Buffer.from(await value.arrayBuffer()),
        });
    }

    return parts;
}

/**
 * Reads a multipart form under a limit on the total body size (the payload limit
 * plus MULTIPART_ENVELOPE_ALLOWANCE_BYTES — that sum is the caller's job) and
 * hands it to a handler, HOLDING its room in the concurrent buffering budget
 * until the handling is over.
 *
 * The form is handed to a callback rather than returned precisely because of the
 * budget. The part buffers live exactly as long as the handler runs: the file
 * goes through sharp and off to storage, and it is in memory the whole time. A
 * reservation released right after parsing would bound the short read phase only
 * — with slow storage the endpoint would manage to "free" the budget for a dozen
 * hundred-megabyte bodies, none of which had gone anywhere. The callback instead
 * of a read/release pair is there so that the release cannot be forgotten: a
 * leaked reservation narrows the ceiling for good.
 *
 * The body-read limit cannot vary by file type: parts of the form become
 * available only after the whole body has been read. The endpoint therefore uses
 * a single READ limit, set by the largest file type it may accept; each type's
 * own ceiling is enforced by the `validate*` helpers after parsing.
 *
 * @param event - Request event.
 * @param maxBytes - Maximum size of the form body.
 * @param use - Handler of the parsed form; its result is returned to the caller.
 * @param budget - Concurrent buffering budget; the shared one by default.
 * @returns Result of the handler.
 */
export async function withMultipartFormData<T>(
    event: H3Event,
    maxBytes: number,
    use: (parts: IUploadedFilePart[]) => Promise<T>,
    budget: IInflightBodyBudget = inflightMultipartBudget
): Promise<T> {
    const contentType = getHeader(event, 'content-type') ?? '';

    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Expected multipart/form-data request',
        });
    }

    const reservation = reserveRequestBody(event, maxBytes, budget);

    try {
        const buffer = await collectStreamWithLimit(event.node.req, reservation.limitBytes, () =>
            payloadTooLarge(maxBytes)
        );

        if (buffer.length === 0) {
            return await use([]);
        }

        return await use(await parseMultipartBuffer(buffer, contentType));
    } finally {
        reservation.release();
    }
}
