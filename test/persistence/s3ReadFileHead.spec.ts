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
        constructor(public input: Record<string, unknown>) {}
    },
    DeleteObjectCommand: class {
        constructor(public input: Record<string, unknown>) {}
    },
    GetObjectCommand: class {
        constructor(public input: Record<string, unknown>) {}
    },
    ListObjectsV2Command: class {
        constructor(public input: Record<string, unknown>) {}
    },
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

import { createS3PublishAdapter } from '../../src/runtime/modules/persistence/server/s3/s3PublishAdapter';
// #endregion

/**
 * The body of a GetObject response: the SDK hands the bytes over through
 * transformToByteArray.
 */
function makeBody(bytes: number[]) {
    return {
        Body: {
            transformToByteArray: () => Promise.resolve(new Uint8Array(bytes)),
        },
    };
}

describe('s3PublishAdapter.readFileHead: the ranged read of a head', () => {
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
    });

    it('asks for the first bytes only and returns them as a Buffer', async () => {
        sendMock.mockResolvedValue(makeBody([0x89, 0x50, 0x4e, 0x47]));

        const head = await createS3PublishAdapter().readFileHead('bricks-media/a.png', 4096);

        expect(head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
        // The range is inclusive on both ends: 0-4095 is 4096 bytes. Without it the
        // import would pull a whole video down to look at its signature
        expect(sendMock.mock.calls[0][0].input).toEqual({
            Bucket: 'bucket',
            Key: 'bricks-media/a.png',
            Range: 'bytes=0-4095',
        });
    });

    it('refuses a key outside the managed namespace without a request', async () => {
        await expect(
            createS3PublishAdapter().readFileHead('foreign-prefix/secret.png', 4096)
        ).rejects.toThrow('managed namespace');

        expect(sendMock).not.toHaveBeenCalled();
    });

    it('an answer without a body is an empty head, not a failure', async () => {
        sendMock.mockResolvedValue({});

        const head = await createS3PublishAdapter().readFileHead('bricks-media/a.png', 4096);

        expect(head.length).toBe(0);
    });
});
