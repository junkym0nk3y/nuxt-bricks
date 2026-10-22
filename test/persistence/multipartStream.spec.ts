/**
 * The streaming multipart reader: what it lets through and what it refuses.
 *
 * The cases are behavioral — a form goes in as bytes on a stream, and what comes
 * out is the parts a handler sees or the status a client gets. Two ceilings are
 * checked separately on purpose: the body one counts the envelope, the file one
 * counts a single part, and neither replaces the other.
 */

// #region Imports
// Types
import type { TMultipartPart } from '../../src/runtime/modules/persistence/types/multipartStream';

// Vitest
import { describe, expect, it, vi } from 'vitest';

// Helpers
import { buildMultipartBody, createMultipartEvent } from '../helpers/multipartRequests';

// Utils
import { createConcurrencyGate } from '../../src/runtime/modules/persistence/server/utils/concurrencyGate';
import {
    withMultipartFormData,
    withMultipartParts,
} from '../../src/runtime/modules/persistence/server/utils/multipartStream';
// #endregion

/**
 * Reads every part of a form, collecting the files into buffers.
 *
 * @param parts - The parts of the form.
 * @returns The name, the filename and the bytes of every part.
 */
async function collectEveryPart(
    parts: AsyncIterable<TMultipartPart>
): Promise<{ name: string; filename?: string; value: string }[]> {
    const collected: { name: string; filename?: string; value: string }[] = [];

    for await (const part of parts) {
        if (part.kind === 'field') {
            collected.push({ name: part.name, value: part.value });
            continue;
        }

        const data = await part.collect(1024 * 1024);

        collected.push({ name: part.name, filename: part.filename, value: data.toString('utf8') });
    }

    return collected;
}

describe('withMultipartParts: reading the form as a stream', () => {
    it('hands over the fields and the file in wire order', async () => {
        const body = buildMultipartBody([
            { name: 'category', data: 'photos' },
            { name: 'file', filename: 'clip.mp4', type: 'video/mp4', data: 'MOVIEBYTES' },
        ]);
        const { event } = createMultipartEvent(body);

        const parts = await withMultipartParts(
            event,
            { maxBodyBytes: 1024 * 1024, maxFileBytes: 1024 * 1024 },
            (form) => collectEveryPart(form.parts)
        );

        expect(parts).toEqual([
            { name: 'category', value: 'photos' },
            { name: 'file', filename: 'clip.mp4', value: 'MOVIEBYTES' },
        ]);
    });

    it('gives the file as a stream of chunks, and the bytes survive a one-byte feed', async () => {
        const payload = 'STREAMED-VIDEO-PAYLOAD';
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.mp4', type: 'video/mp4', data: payload },
        ]);
        // One byte per chunk: the head of a video is read the same way, and a
        // reader assuming a chunk holds twelve bytes would break exactly here
        const { event } = createMultipartEvent(body, { chunkSize: 1 });

        const streamed = await withMultipartParts(
            event,
            { maxBodyBytes: 1024 * 1024, maxFileBytes: 1024 * 1024 },
            async (form) => {
                const pieces: Buffer[] = [];

                for await (const part of form.parts) {
                    if (part.kind !== 'file') {
                        continue;
                    }

                    for await (const chunk of part.chunks()) {
                        pieces.push(Buffer.from(chunk));
                    }
                }

                return Buffer.concat(pieces).toString('utf8');
            }
        );

        expect(streamed).toBe(payload);
    });

    it('a part that declared no type reports none, rather than the parser default', async () => {
        const body = Buffer.from(
            [
                `--${'bricks-test-boundary'}`,
                'Content-Disposition: form-data; name="file"; filename="clip.mp4"',
                '',
                'MOVIEBYTES',
                `--${'bricks-test-boundary'}--`,
                '',
            ].join('\r\n'),
            'utf8'
        );
        const { event } = createMultipartEvent(body);

        const declared = await withMultipartParts(
            event,
            { maxBodyBytes: 4096, maxFileBytes: 1024 },
            async (form) => {
                for await (const part of form.parts) {
                    if (part.kind === 'file') {
                        // The bytes still have to arrive: the type is the only
                        // thing missing
                        expect((await part.collect(1024)).toString('utf8')).toBe('MOVIEBYTES');

                        return part.type;
                    }
                }

                return 'no file part';
            }
        );

        // The parser fabricates `text/plain` for a part with no Content-Type, and
        // the callers decide by kind: passing that on would read as a declaration
        // the client never made
        expect(declared).toBeUndefined();
    });

    it('refuses a file part above its own ceiling instead of storing it truncated', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'big.mp4', type: 'video/mp4', data: 'X'.repeat(600) },
        ]);
        const { event } = createMultipartEvent(body);

        // The body ceiling is wide, so the refusal can only come from the per-part
        // one — the parser truncates such a part silently on its own
        await expect(
            withMultipartParts(event, { maxBodyBytes: 1024 * 1024, maxFileBytes: 100 }, (form) =>
                collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 413 });
    });

    it('counts the envelope too: a body over the ceiling is refused mid-read', async () => {
        const body = buildMultipartBody([
            {
                name: 'file',
                filename: 'a.bin',
                type: 'application/octet-stream',
                data: 'X'.repeat(40),
            },
        ]);
        const { event } = createMultipartEvent(body, { chunkSize: 16 });

        // The file itself fits into the per-part ceiling; what does not fit is the
        // whole body with its boundaries and part headers
        await expect(
            withMultipartParts(event, { maxBodyBytes: 60, maxFileBytes: 1024 }, (form) =>
                collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 413 });
    });

    it('a declared length above the ceiling is refused without reading a byte', async () => {
        const body = buildMultipartBody([{ name: 'file', filename: 'a.bin', data: 'payload' }]);
        const { event, readChunks } = createMultipartEvent(body, { contentLength: 10 * 1024 });

        await expect(
            withMultipartParts(event, { maxBodyBytes: 1024, maxFileBytes: 1024 }, (form) =>
                collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 413 });
        expect(readChunks()).toBe(0);
    });

    it('a declared length above the ceiling wins over a busy entrance', async () => {
        const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueue: 0 });
        const body = buildMultipartBody([{ name: 'category', data: 'photos' }]);

        await gate.run(async () => {
            const oversized = createMultipartEvent(body, { contentLength: 10 * 1024 });

            // The order matters: a request that can never become valid gets a
            // stable 413 rather than a 503 inviting it to try again later
            await expect(
                withMultipartParts(
                    oversized.event,
                    { maxBodyBytes: 1024, maxFileBytes: 1024, gate },
                    (form) => collectEveryPart(form.parts)
                )
            ).rejects.toMatchObject({ statusCode: 413 });
        });
    });

    it('a body that ended before its last byte is a refusal, not an empty form', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.mp4', type: 'video/mp4', data: 'HALF' },
        ]);
        const { event } = createMultipartEvent(body.subarray(0, body.byteLength - 20), {
            cutShort: true,
        });

        await expect(
            withMultipartParts(event, { maxBodyBytes: 1024, maxFileBytes: 1024 }, (form) =>
                collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses a garbage body, a missing boundary and an oversized one', async () => {
        const garbage = createMultipartEvent(Buffer.from('definitely not multipart'));

        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(
            withMultipartParts(garbage.event, { maxBodyBytes: 1024, maxFileBytes: 1024 }, (form) =>
                collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 400 });

        const noBoundary = createMultipartEvent(Buffer.from('x'), {
            contentType: 'multipart/form-data',
        });

        await expect(
            withMultipartParts(
                noBoundary.event,
                { maxBodyBytes: 1024, maxFileBytes: 1024 },
                (form) => collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 400 });

        const longBoundary = createMultipartEvent(Buffer.from('x'), {
            contentType: `multipart/form-data; boundary=${'b'.repeat(71)}`,
        });

        await expect(
            withMultipartParts(
                longBoundary.event,
                { maxBodyBytes: 1024, maxFileBytes: 1024 },
                (form) => collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses a second file part rather than silently dropping it', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.mp4', type: 'video/mp4', data: 'FIRST' },
            { name: 'file', filename: 'b.mp4', type: 'video/mp4', data: 'SECOND' },
        ]);
        const { event } = createMultipartEvent(body);

        await expect(
            withMultipartParts(event, { maxBodyBytes: 4096, maxFileBytes: 1024 }, (form) =>
                collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('the bytes of a part may be taken only once', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.mp4', type: 'video/mp4', data: 'PAYLOAD' },
        ]);
        const { event } = createMultipartEvent(body);

        await expect(
            withMultipartParts(event, { maxBodyBytes: 4096, maxFileBytes: 1024 }, async (form) => {
                for await (const part of form.parts) {
                    if (part.kind !== 'file') {
                        continue;
                    }

                    await part.collect(1024);
                    // A second reader would get an empty buffer rather than a copy:
                    // the source is the network
                    await part.collect(1024);
                }
            })
        ).rejects.toThrow('can be read only once');
    });

    it('advancing over an unread file part is refused, not stalled', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.mp4', type: 'video/mp4', data: 'PAYLOAD' },
            { name: 'category', data: 'photos' },
        ]);
        const { event } = createMultipartEvent(body);

        await expect(
            withMultipartParts(event, { maxBodyBytes: 4096, maxFileBytes: 1024 }, async (form) => {
                for await (const part of form.parts) {
                    expect(part.kind).toBeDefined();
                }
            })
        ).rejects.toThrow('left unread');
    });

    it('the ingress slot is refused with 503 and freed after a failure', async () => {
        const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueue: 0 });
        const body = buildMultipartBody([{ name: 'category', data: 'photos' }]);
        const failure = new Error('the handler refused this form');

        const busy = createMultipartEvent(body);
        const occupied = createMultipartEvent(body);

        // The first read holds the only slot until its handler is released
        let releaseHandler: (() => void) | undefined;
        let firstRead: Promise<void> | undefined;
        const handlerStarted = new Promise<void>((resolveStarted) => {
            firstRead = withMultipartParts(
                busy.event,
                { maxBodyBytes: 4096, maxFileBytes: 1024, gate },
                async () => {
                    resolveStarted();

                    return new Promise<void>((resolve) => {
                        releaseHandler = resolve;
                    });
                }
            );
        });

        await handlerStarted;

        await expect(
            withMultipartParts(
                occupied.event,
                { maxBodyBytes: 4096, maxFileBytes: 1024, gate },
                (form) => collectEveryPart(form.parts)
            )
        ).rejects.toMatchObject({ statusCode: 503 });
        expect(occupied.readChunks()).toBe(0);

        releaseHandler?.();
        await firstRead;

        // A handler that throws must give the slot back all the same
        const throwing = createMultipartEvent(body);

        await expect(
            withMultipartParts(
                throwing.event,
                { maxBodyBytes: 4096, maxFileBytes: 1024, gate },
                async () => {
                    throw failure;
                }
            )
        ).rejects.toBe(failure);

        const afterFailure = createMultipartEvent(body);

        expect(
            await withMultipartParts(
                afterFailure.event,
                { maxBodyBytes: 4096, maxFileBytes: 1024, gate },
                (form) => collectEveryPart(form.parts)
            )
        ).toHaveLength(1);
    });

    it('the signal is aborted when the connection closes before the answer', async () => {
        const body = buildMultipartBody([{ name: 'category', data: 'photos' }]);
        const { event, response } = createMultipartEvent(body);

        const aborted = await withMultipartParts(
            event,
            { maxBodyBytes: 4096, maxFileBytes: 1024 },
            async (form) => {
                // The body did arrive in full, and the client left while the answer
                // was still being prepared: a write in flight has to stop all the
                // same, so the request stream alone is not enough to watch
                response.emit('close');

                return form.signal.aborted;
            }
        );

        expect(aborted).toBe(true);
    });

    it('a refusal leaves the request stream alive: destroying it takes the answer with it', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.mp4', type: 'video/mp4', data: 'x'.repeat(40_000) },
        ]);
        const { event, request } = createMultipartEvent(body, { chunkSize: 512 });
        const refusal = new Error('the content is not a video');

        await expect(
            withMultipartParts(
                event,
                { maxBodyBytes: 1 << 20, maxFileBytes: 1 << 20 },
                async (form) => {
                    for await (const part of form.parts) {
                        if (part.kind !== 'file') {
                            continue;
                        }

                        // The handler reads the head, decides against the file and
                        // refuses — the rest of the part stays unread
                        await part.chunks()[Symbol.asyncIterator]().next();

                        throw refusal;
                    }
                }
            )
        ).rejects.toBe(refusal);

        // Destroying the request destroys the socket under it, and then the refusal
        // reaches nobody: the client waits out its own timeout having received not a
        // byte. Node closes a connection whose body was not read to the end itself,
        // once the answer has gone out
        expect(request.destroyed).toBe(false);
    });

    it('the signal is aborted when the client leaves the body unfinished', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.mp4', type: 'video/mp4', data: 'PAYLOAD' },
        ]);
        const { event, request } = createMultipartEvent(body, { cutShort: true });

        const aborted = await withMultipartParts(
            event,
            { maxBodyBytes: 4096, maxFileBytes: 1024 },
            async (form) => {
                // What the departure of a client looks like to the handler: the
                // request closes with its body unfinished
                request.emit('close');

                return form.signal.aborted;
            }
        );

        expect(aborted).toBe(true);
    });
});

describe('withMultipartFormData: the same form collected in memory', () => {
    it('returns the parts as bytes, the file name and the declared type included', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'снимок.png', type: 'image/png', data: 'PNGDATA' },
            { name: 'pageId', data: '42' },
        ]);
        const { event } = createMultipartEvent(body);

        const parts = await withMultipartFormData(event, 4096, async (collected) => collected);

        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatchObject({
            name: 'file',
            filename: 'снимок.png',
            type: 'image/png',
        });
        expect(parts[0].data.toString('utf8')).toBe('PNGDATA');
        expect(parts[1]).toMatchObject({ name: 'pageId' });
        expect(parts[1].data.toString('utf8')).toBe('42');
    });

    it('a file before the fields is accepted: the order of a form is not dictated', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.png', type: 'image/png', data: 'PNGDATA' },
            { name: 'cropSide', data: '64' },
        ]);
        const { event } = createMultipartEvent(body);

        const names = await withMultipartFormData(event, 4096, async (collected) =>
            collected.map((part) => part.name)
        );

        expect(names).toEqual(['file', 'cropSide']);
    });

    it('refuses to collect more than the ceiling allows', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'a.png', type: 'image/png', data: 'X'.repeat(500) },
        ]);
        const { event } = createMultipartEvent(body);

        await expect(
            withMultipartFormData(event, 200, async (collected) => collected)
        ).rejects.toMatchObject({ statusCode: 413 });
    });
});
