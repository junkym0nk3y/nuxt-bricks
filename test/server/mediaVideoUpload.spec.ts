/**
 * The video path of POST /api/bricks/media/upload, end to end over a real
 * multipart body: the parser, the routing by kind and the streaming write are all
 * live, only the adapters are fakes.
 *
 * That is the point of the suite. The defect it guards is a memory peak, so a
 * test over a substituted form reader would prove nothing: what matters is that
 * the bytes of a video reach storage as pieces of a stream and that an image is
 * still collected and processed as before.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IThrownHttpError } from '../helpers/types';

// Helpers
import { buildMultipartBody, createMultipartEvent } from '../helpers/multipartRequests';
// #endregion

// #region Mocks
const { createMediaMock, listMediaCategoriesMock, uploadFileMock, deleteFileMock, appConfig } =
    vi.hoisted(() => ({
        createMediaMock: vi.fn(),
        listMediaCategoriesMock: vi.fn(),
        uploadFileMock: vi.fn(),
        deleteFileMock: vi.fn(),
        // The media limits of the app config: a test that needs the image ceiling
        // above the video one sets them here
        appConfig: { value: {} as Record<string, unknown> },
    }));

/** What the streaming upload received, gathered chunk by chunk. */
const streamedUploads: { key: string; mimeType: string; chunks: number; bytes: number }[] = [];

vi.mock('nitropack/runtime', () => ({
    useAppConfig: () => appConfig.value,
    useRuntimeConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/defaultStorage', () => ({
    getBricksDefaultStorageFactory: () => undefined,
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksStorageAdapter: () => ({
        createMedia: createMediaMock,
        listMediaCategories: listMediaCategoriesMock,
    }),
    useBricksPublishAdapter: () => ({
        buildFileKey: (kind: string, filename: string): string => `bricks-${kind}/${filename}`,
        uploadFile: uploadFileMock,
        deleteFile: deleteFileMock,
        isOwnedUrl: (url: string): boolean => url.startsWith('https://storage.example.com/'),
        async uploadFileStream({
            key,
            mimeType,
            body,
        }: {
            key: string;
            mimeType: string;
            body: AsyncIterable<Uint8Array>;
        }) {
            let chunks = 0;
            let bytes = 0;

            for await (const chunk of body) {
                chunks += 1;
                bytes += chunk.byteLength;
            }

            streamedUploads.push({ key, mimeType, chunks, bytes });

            return { url: `https://storage.example.com/${key}`, key, size: bytes };
        },
    }),
}));

vi.mock('../../src/runtime/server/utils/requestRateLimiter', () => ({
    assertWithinRateLimit: vi.fn(),
    createFixedWindowRateLimiter: () => ({ hit: () => 0 }),
}));

import uploadMediaHandler from '../../src/runtime/server/api/bricks/media/upload.post';
// #endregion

/** The head of an ISO-BMFF container: `ftyp` plus the `isom` brand. */
function buildMp4Bytes(sizeBytes: number): Buffer {
    const head = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftypisom', 'latin1'),
    ]);

    return Buffer.concat([head, Buffer.alloc(Math.max(sizeBytes - head.byteLength, 0), 0x61)]);
}

/** The handler's answer, or the error it threw. */
async function callHandler(event: Parameters<typeof uploadMediaHandler>[0]): Promise<unknown> {
    return uploadMediaHandler(event);
}

/** The error the handler threw. */
async function catchHandlerError(
    event: Parameters<typeof uploadMediaHandler>[0]
): Promise<IThrownHttpError> {
    try {
        await uploadMediaHandler(event);
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected the handler to throw');
}

describe('POST /media/upload: a video travels to storage as a stream', () => {
    beforeEach(() => {
        createMediaMock.mockReset();
        listMediaCategoriesMock.mockReset();
        uploadFileMock.mockReset();
        deleteFileMock.mockReset();
        streamedUploads.length = 0;
        appConfig.value = {};

        createMediaMock.mockImplementation((payload: { url: string; size: number }) => ({
            id: 1,
            ...payload,
        }));
        listMediaCategoriesMock.mockResolvedValue([{ id: 1, slug: 'clips', label: 'Clips' }]);
        deleteFileMock.mockResolvedValue(undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('streams the bytes, never buffering the file, and registers the size it received', async () => {
        const video = buildMp4Bytes(4096);
        const { event } = createMultipartEvent(
            buildMultipartBody([
                { name: 'category', data: 'clips' },
                { name: 'file', filename: 'clip.mp4', type: 'video/mp4', data: video },
            ]),
            { chunkSize: 512 }
        );

        const item = (await callHandler(event)) as { url: string; size: number };

        expect(streamedUploads).toHaveLength(1);
        expect(streamedUploads[0].bytes).toBe(video.byteLength);
        // More than one chunk: the file was never assembled whole anywhere
        expect(streamedUploads[0].chunks).toBeGreaterThan(1);
        expect(streamedUploads[0].mimeType).toBe('video/mp4');
        // The buffered upload path is not touched at all for a video
        expect(uploadFileMock).not.toHaveBeenCalled();
        expect(item.size).toBe(video.byteLength);
        expect(createMediaMock).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'clips',
                mimeType: 'video/mp4',
                size: video.byteLength,
                width: null,
                height: null,
            })
        );
    });

    it('reads the container off a head that arrives one byte at a time', async () => {
        const { event } = createMultipartEvent(
            buildMultipartBody([
                {
                    name: 'file',
                    filename: 'clip.mov',
                    type: 'video/quicktime',
                    data: buildMp4Bytes(64),
                },
            ]),
            { chunkSize: 1 }
        );

        await callHandler(event);

        // `mov` and `mp4` share one signature, so the name decides inside the
        // group — and the twelve bytes it takes to see that came in twelve chunks
        expect(streamedUploads[0].key).toMatch(/\.mov$/);
        expect(streamedUploads[0].mimeType).toBe('video/quicktime');
    });

    it('refuses content that is not a video before a byte reaches storage', async () => {
        const { event } = createMultipartEvent(
            buildMultipartBody([
                {
                    name: 'file',
                    filename: 'fake.mp4',
                    type: 'video/mp4',
                    data: Buffer.from('<html>not a video at all</html>', 'utf8'),
                },
            ])
        );

        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(400);
        expect(streamedUploads).toHaveLength(0);
        expect(createMediaMock).not.toHaveBeenCalled();
    });

    it('an unknown category ahead of the file is refused before the upload is paid for', async () => {
        listMediaCategoriesMock.mockResolvedValue([{ id: 1, slug: 'clips', label: 'Clips' }]);

        const { event } = createMultipartEvent(
            buildMultipartBody([
                { name: 'category', data: 'gone' },
                { name: 'file', filename: 'clip.mp4', type: 'video/mp4', data: buildMp4Bytes(256) },
            ])
        );

        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(400);
        expect(streamedUploads).toHaveLength(0);
    });

    it('a field behind the file that turns out garbage takes the uploaded object with it', async () => {
        const { event } = createMultipartEvent(
            buildMultipartBody([
                { name: 'file', filename: 'clip.mp4', type: 'video/mp4', data: buildMp4Bytes(256) },
                // A value the validator refuses (the column takes fifty
                // characters): the refusal lands AFTER the bytes are already in
                // the bucket, which is exactly the case a cleanup of its own
                // exists for
                { name: 'category', data: 'c'.repeat(60) },
            ])
        );

        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(400);
        expect(streamedUploads).toHaveLength(1);
        expect(deleteFileMock).toHaveBeenCalledWith(
            `https://storage.example.com/${streamedUploads[0].key}`
        );
        expect(createMediaMock).not.toHaveBeenCalled();
    });

    it('a body cut short leaves no record and no orphan behind', async () => {
        const body = buildMultipartBody([
            { name: 'file', filename: 'clip.mp4', type: 'video/mp4', data: buildMp4Bytes(256) },
            { name: 'category', data: 'clips' },
        ]);
        // The tail never arrived: whether the file part had made it to storage by
        // then depends on the timing, and both outcomes are legitimate — what must
        // never happen is an object with no record
        const { event } = createMultipartEvent(body.subarray(0, body.byteLength - 30), {
            cutShort: true,
            chunkSize: 64,
        });

        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(400);
        expect(createMediaMock).not.toHaveBeenCalled();

        if (streamedUploads.length > 0) {
            expect(deleteFileMock).toHaveBeenCalledWith(
                `https://storage.example.com/${streamedUploads[0].key}`
            );
        }
    });

    it('a video above the ceiling is refused as it flows, not by the declared length', async () => {
        // The image ceiling is ABOVE the video one on purpose: the parser gets the
        // larger of the two (it cannot know what a part is before it starts), so a
        // video between them passes every ceiling except the one checked as the
        // bytes flow. And no Content-Length is sent, so the pre-check cannot fire
        appConfig.value = { bricks: { media: { maxUploadSizeMb: 20, maxVideoUploadSizeMb: 1 } } };

        const { event } = createMultipartEvent(
            buildMultipartBody([
                {
                    name: 'file',
                    filename: 'clip.mp4',
                    type: 'video/mp4',
                    data: buildMp4Bytes(3 * 1024 * 1024),
                },
            ]),
            { chunkSize: 64 * 1024 }
        );

        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(413);
        expect(createMediaMock).not.toHaveBeenCalled();
    });

    it('a declared length above the ceiling is refused before the body is read', async () => {
        const { event, readChunks } = createMultipartEvent(
            buildMultipartBody([
                {
                    name: 'file',
                    filename: 'clip.mp4',
                    type: 'video/mp4',
                    data: buildMp4Bytes(2048),
                },
            ]),
            { contentLength: 200 * 1024 * 1024 }
        );

        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(413);
        expect(readChunks()).toBe(0);
        expect(streamedUploads).toHaveLength(0);
    });

    it('an image still goes the buffered way: sharp needs the bytes', async () => {
        uploadFileMock.mockImplementation(({ key }: { key: string }) => ({
            url: `https://storage.example.com/${key}`,
            key,
            size: 64,
        }));

        const png = Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.alloc(64, 0x61),
        ]);
        const { event } = createMultipartEvent(
            buildMultipartBody([{ name: 'file', filename: 'a.png', type: 'image/png', data: png }])
        );

        // sharp refuses this made-up PNG, and that is the answer we assert: the
        // point is only that the file went down the buffered path
        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(400);
        expect(streamedUploads).toHaveLength(0);
    });
});
