// #region Imports
// Types
import type { H3Event } from 'h3';
import type { IMultipartBodyPart, IMultipartRequestOptions } from './types';

// Node
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
// #endregion

/** The default boundary of a form: short, well inside the RFC ceiling. */
export const TEST_MULTIPART_BOUNDARY = 'bricks-test-boundary';

/**
 * Assembles a multipart body out of text fields and files.
 *
 * @param parts - The parts in the order they travel on the wire.
 * @param boundary - The boundary of the form.
 * @returns The body as bytes.
 */
export function buildMultipartBody(
    parts: IMultipartBodyPart[],
    boundary = TEST_MULTIPART_BOUNDARY
): Buffer {
    const chunks = parts.map((part) => {
        const disposition = part.filename
            ? `form-data; name="${part.name}"; filename="${part.filename}"`
            : `form-data; name="${part.name}"`;
        const headers = part.type
            ? `Content-Disposition: ${disposition}\r\nContent-Type: ${part.type}`
            : `Content-Disposition: ${disposition}`;
        const body = Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data, 'utf8');

        return Buffer.concat([
            Buffer.from(`--${boundary}\r\n${headers}\r\n\r\n`, 'utf8'),
            body,
            Buffer.from('\r\n', 'utf8'),
        ]);
    });

    return Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`, 'utf8')]);
}

/**
 * A request event with a STREAMING body: a real readable, the headers h3 reads and
 * the `complete` flag that tells a finished body from a cut-off one.
 *
 * A real stream is mandatory here, unlike in `createFakeH3Event`: what is under
 * test is the streaming read of a form, and an array in place of the body would
 * take both the backpressure and the broken connection out of the check.
 *
 * @param body - The bytes of the body.
 * @param options - The chunk size, the headers and whether the body is cut short.
 * @returns The event, how many chunks were read off it, the request stream and the
 * response object (its `close` is how a client leaving after the body looks).
 */
export function createMultipartEvent(
    body: Buffer,
    options: IMultipartRequestOptions = {}
): { event: H3Event; readChunks: () => number; request: Readable; response: EventEmitter } {
    const chunkSize = options.chunkSize ?? body.byteLength;
    const chunks: Buffer[] = [];
    let read = 0;

    for (let offset = 0; offset < body.byteLength; offset += Math.max(chunkSize, 1)) {
        chunks.push(body.subarray(offset, offset + Math.max(chunkSize, 1)));
    }

    const request = new Readable({
        read(): void {
            const next = chunks.shift();

            if (next) {
                read += 1;
                this.push(next);

                return;
            }

            if (!options.cutShort) {
                Object.assign(request, { complete: true });
            }

            this.push(null);
        },
    });

    Object.assign(request, {
        complete: false,
        headers: {
            'content-type':
                options.contentType ?? `multipart/form-data; boundary=${TEST_MULTIPART_BOUNDARY}`,
            ...(options.contentLength === undefined
                ? {}
                : { 'content-length': String(options.contentLength) }),
        },
    });

    const response = Object.assign(new EventEmitter(), { writableEnded: false });

    return {
        event: { node: { req: request, res: response } } as unknown as H3Event,
        readChunks: (): number => read,
        request,
        response,
    };
}
