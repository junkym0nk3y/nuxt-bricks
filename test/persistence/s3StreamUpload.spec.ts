/**
 * The streaming upload into the bucket: which protocol is chosen, and what is
 * left behind when it fails.
 *
 * The cases watch the commands the adapter sends, because that is the whole
 * contract: a stream that fits into one part must not pay for a multipart upload,
 * and a failure must never leave parts nobody will ever collect — an unfinished
 * multipart upload is billed until it is aborted explicitly.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { sendMock, runtimeConfigMock } = vi.hoisted(() => ({
    sendMock: vi.fn(),
    runtimeConfigMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: class {
        send = sendMock;
    },
    PutObjectCommand: class {
        kind = 'put';

        constructor(public input: Record<string, unknown>) {}
    },
    DeleteObjectCommand: class {
        kind = 'delete';

        constructor(public input: Record<string, unknown>) {}
    },
    GetObjectCommand: class {
        constructor(public input: Record<string, unknown>) {}
    },
    ListObjectsV2Command: class {
        constructor(public input: Record<string, unknown>) {}
    },
    CreateMultipartUploadCommand: class {
        kind = 'create';

        constructor(public input: Record<string, unknown>) {}
    },
    UploadPartCommand: class {
        kind = 'part';

        constructor(public input: Record<string, unknown>) {}
    },
    CompleteMultipartUploadCommand: class {
        kind = 'complete';

        constructor(public input: Record<string, unknown>) {}
    },
    AbortMultipartUploadCommand: class {
        kind = 'abort';

        constructor(public input: Record<string, unknown>) {}
    },
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

import { createS3PublishAdapter } from '../../src/runtime/modules/persistence/server/s3/s3PublishAdapter';
import { resolveMultipartPartSize } from '../../src/runtime/modules/persistence/server/s3/s3StreamUpload';
// #endregion

describe('resolveMultipartPartSize: what one upload costs in memory', () => {
    it('holds the default for the file ceilings a media library has', () => {
        expect(resolveMultipartPartSize(100 * 1024 * 1024)).toBe(8 * 1024 * 1024);
    });

    it('grows with the ceiling so that the parts do not run out', () => {
        // Ten thousand parts is the S3 maximum: a fixed size would run out of part
        // numbers in the middle of an upload of a file this big
        const ceilingBytes = 200 * 1024 * 1024 * 1024;

        expect(resolveMultipartPartSize(ceilingBytes)).toBe(Math.ceil(ceilingBytes / 10_000));
    });

    it('stops growing at the cap: the buffer is allocated before the first byte', () => {
        // The file ceiling comes from `bricks.media` and has no upper bound of its
        // own. Derived from it alone, a configuration allowing what S3 allows would
        // allocate half a gigabyte per upload — for a tiny file too, and times the
        // number of ingress slots
        expect(resolveMultipartPartSize(5 * 1024 * 1024 * 1024 * 1024)).toBe(64 * 1024 * 1024);
    });
});

/** The part size the adapter uses for the ceilings of this suite. */
const PART_SIZE_BYTES = 8 * 1024 * 1024;

/** The video ceiling passed with every upload of this suite. */
const MAX_BYTES = 100 * 1024 * 1024;

/** The kinds of the commands sent during a run, in order. */
function sentKinds(): string[] {
    return sendMock.mock.calls.map((call) => {
        const command = call[0] as { kind?: string };

        return command.kind ?? 'unknown';
    });
}

/** The inputs of every command of one kind. */
function inputsOf(kind: string): Record<string, unknown>[] {
    return sendMock.mock.calls
        .filter((call) => (call[0] as { kind?: string }).kind === kind)
        .map((call) => (call[0] as { input: Record<string, unknown> }).input);
}

/** A stream of the given chunk sizes, filled with a recognizable byte. */
async function* streamOf(chunkSizes: number[]): AsyncGenerator<Uint8Array> {
    for (const size of chunkSizes) {
        yield Buffer.alloc(size, 0x61);
    }
}

/** Uploads a stream through the adapter under the suite's ceiling. */
function uploadStream(
    body: AsyncIterable<Uint8Array>,
    key = 'bricks-media/uuid.mp4'
): Promise<{ url: string; key: string; size: number }> {
    return createS3PublishAdapter().uploadFileStream({
        key,
        mimeType: 'video/mp4',
        body,
        maxBytes: MAX_BYTES,
        signal: AbortSignal.timeout(60_000),
    });
}

describe('s3PublishAdapter.uploadFileStream: the protocol follows the size', () => {
    beforeEach(() => {
        sendMock.mockReset();
        runtimeConfigMock.mockReset();
        runtimeConfigMock.mockReturnValue({
            bricksS3: {
                endpoint: 'https://storage.example.com',
                bucket: 'bucket',
                accessKeyId: 'key',
                secretAccessKey: 'secret',
                prefix: 'bricks-media/',
                thumbnailsPrefix: 'bricks-thumbnails/',
            },
        });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('a short stream goes as one PutObject and reports the bytes it received', async () => {
        sendMock.mockResolvedValue({});

        const uploaded = await uploadStream(streamOf([1024, 2048, 1]));

        expect(sentKinds()).toEqual(['put']);
        expect(uploaded).toEqual({
            url: 'https://storage.example.com/bucket/bricks-media/uuid.mp4',
            key: 'bricks-media/uuid.mp4',
            size: 3073,
        });
    });

    it('a stream of exactly one part still goes as one PutObject', async () => {
        sendMock.mockResolvedValue({});

        // The flush waits for the bytes that follow on purpose: without that a
        // file of exactly a part would pay three requests instead of one
        const uploaded = await uploadStream(streamOf([PART_SIZE_BYTES]));

        expect(sentKinds()).toEqual(['put']);
        expect(uploaded.size).toBe(PART_SIZE_BYTES);
    });

    it('one byte past a part turns the upload into a multipart one', async () => {
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'create') {
                return Promise.resolve({ UploadId: 'upload-1' });
            }

            if (command.kind === 'part') {
                return Promise.resolve({ ETag: `etag-${inputsOf('part').length}` });
            }

            return Promise.resolve({});
        });

        const uploaded = await uploadStream(streamOf([PART_SIZE_BYTES, 1]));

        expect(sentKinds()).toEqual(['create', 'part', 'part', 'complete']);

        const parts = inputsOf('part');
        expect(parts.map((input) => input.PartNumber)).toEqual([1, 2]);
        expect((parts[0].Body as Uint8Array).byteLength).toBe(PART_SIZE_BYTES);
        expect((parts[1].Body as Uint8Array).byteLength).toBe(1);
        expect(uploaded.size).toBe(PART_SIZE_BYTES + 1);

        // The completion lists the parts with the tags storage answered with:
        // a list out of order or short of a tag is a failed upload
        expect(inputsOf('complete')[0].MultipartUpload).toEqual({
            Parts: [
                { ETag: 'etag-1', PartNumber: 1 },
                { ETag: 'etag-2', PartNumber: 2 },
            ],
        });
    });

    it('two full parts send no empty third one', async () => {
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'create') {
                return Promise.resolve({ UploadId: 'upload-1' });
            }

            return Promise.resolve({ ETag: 'etag' });
        });

        await uploadStream(streamOf([PART_SIZE_BYTES, PART_SIZE_BYTES]));

        expect(sentKinds()).toEqual(['create', 'part', 'part', 'complete']);
        expect(inputsOf('part').map((input) => (input.Body as Uint8Array).byteLength)).toEqual([
            PART_SIZE_BYTES,
            PART_SIZE_BYTES,
        ]);
    });

    it('the key outside the managed namespace is refused before any request', async () => {
        await expect(uploadStream(streamOf([16]), 'foreign/uuid.mp4')).rejects.toThrow(
            'outside of the managed prefixes'
        );
        expect(sendMock).not.toHaveBeenCalled();
    });

    it('every request carries the caller signal, so a departed client stops the write', async () => {
        sendMock.mockResolvedValue({});

        const signal = AbortSignal.timeout(60_000);

        await createS3PublishAdapter().uploadFileStream({
            key: 'bricks-media/uuid.mp4',
            mimeType: 'video/mp4',
            body: streamOf([32]),
            maxBytes: MAX_BYTES,
            signal,
        });

        expect(sendMock.mock.calls[0][1]).toEqual({ abortSignal: signal });
    });
});

describe('s3PublishAdapter.uploadFileStream: nothing is left behind on a failure', () => {
    beforeEach(() => {
        sendMock.mockReset();
        runtimeConfigMock.mockReset();
        runtimeConfigMock.mockReturnValue({
            bricksS3: {
                endpoint: 'https://storage.example.com',
                bucket: 'bucket',
                accessKeyId: 'key',
                secretAccessKey: 'secret',
                prefix: 'bricks-media/',
                thumbnailsPrefix: 'bricks-thumbnails/',
            },
        });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('a failed PutObject of a short stream is compensated by a deletion', async () => {
        const failure = new Error('storage refused the write');
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'put') {
                return Promise.reject(failure);
            }

            return Promise.resolve({});
        });

        await expect(uploadStream(streamOf([64]))).rejects.toBe(failure);
        expect(sentKinds()).toEqual(['put', 'delete']);
    });

    it('a body that refused mid-stream aborts the multipart upload and keeps its reason', async () => {
        const refusal = new Error('Video is too large');
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'create') {
                return Promise.resolve({ UploadId: 'upload-1' });
            }

            return Promise.resolve({ ETag: 'etag' });
        });

        async function* refusingBody(): AsyncGenerator<Uint8Array> {
            yield Buffer.alloc(PART_SIZE_BYTES, 0x61);
            yield Buffer.alloc(16, 0x61);

            throw refusal;
        }

        await expect(uploadStream(refusingBody())).rejects.toBe(refusal);

        // No deletion: the object was never completed, so there is nothing to
        // delete — only the parts, and those go with the abort
        expect(sentKinds()).toEqual(['create', 'part', 'abort']);
    });

    it('a failed part upload aborts the multipart upload', async () => {
        const failure = new Error('part upload failed');
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'create') {
                return Promise.resolve({ UploadId: 'upload-1' });
            }

            if (command.kind === 'part') {
                return Promise.reject(failure);
            }

            return Promise.resolve({});
        });

        await expect(uploadStream(streamOf([PART_SIZE_BYTES, 1]))).rejects.toBe(failure);
        expect(sentKinds()).toEqual(['create', 'part', 'abort']);
    });

    it('a failed completion aborts AND deletes: its outcome is unknown', async () => {
        const failure = new Error('completion timed out');
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'create') {
                return Promise.resolve({ UploadId: 'upload-1' });
            }

            if (command.kind === 'complete') {
                return Promise.reject(failure);
            }

            return Promise.resolve({ ETag: 'etag' });
        });

        await expect(uploadStream(streamOf([PART_SIZE_BYTES, 1]))).rejects.toBe(failure);
        // The answer may have been lost after the object was already assembled,
        // and nothing will ever reference it: the caller got no URL
        expect(sentKinds()).toEqual(['create', 'part', 'part', 'complete', 'abort', 'delete']);
    });

    it('a cleanup that fails too does not replace the original error', async () => {
        const failure = new Error('part upload failed');
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'create') {
                return Promise.resolve({ UploadId: 'upload-1' });
            }

            return Promise.reject(command.kind === 'part' ? failure : new Error('abort failed'));
        });

        await expect(uploadStream(streamOf([PART_SIZE_BYTES, 1]))).rejects.toBe(failure);
        expect(sentKinds()).toEqual(['create', 'part', 'abort']);
    });

    it('a storage answer without an upload id is a failure, not a silent upload', async () => {
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'create') {
                return Promise.resolve({});
            }

            return Promise.resolve({ ETag: 'etag' });
        });

        await expect(uploadStream(streamOf([PART_SIZE_BYTES, 1]))).rejects.toThrow(
            'no multipart upload id'
        );
    });

    it('a part answer without an ETag is a failure: the completion needs the tag', async () => {
        sendMock.mockImplementation((command: { kind?: string }) => {
            if (command.kind === 'create') {
                return Promise.resolve({ UploadId: 'upload-1' });
            }

            return Promise.resolve({});
        });

        await expect(uploadStream(streamOf([PART_SIZE_BYTES, 1]))).rejects.toThrow('no ETag');
        expect(sentKinds()).toEqual(['create', 'part', 'abort']);
    });
});
