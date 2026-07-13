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
    ListObjectsV2Command: class {
        constructor(public input: Record<string, unknown>) {}
    },
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

import { createS3PublishAdapter } from '../../src/runtime/modules/persistence/server/s3/s3PublishAdapter';
// #endregion

/** Объект листинга S3. */
function makeObject(key: string) {
    return { Key: key, Size: 100, LastModified: new Date('2026-07-01T00:00:00.000Z') };
}

describe('s3PublishAdapter.listFiles: пагинация ListObjectsV2', () => {
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

    it('дочитывает все страницы по NextContinuationToken', async () => {
        sendMock
            .mockResolvedValueOnce({
                Contents: [makeObject('bricks-media/a.webp'), makeObject('bricks-media/')],
                IsTruncated: true,
                NextContinuationToken: 'token-1',
            })
            .mockResolvedValueOnce({
                Contents: [makeObject('bricks-media/b.webp')],
                IsTruncated: false,
            });

        const files = await createS3PublishAdapter().listFiles();

        // Псевдо-папка `bricks-media/` отфильтрована, оба листинга склеены
        expect(files.map((file) => file.key)).toEqual([
            'bricks-media/a.webp',
            'bricks-media/b.webp',
        ]);
        expect(files[0].url).toBe('https://storage.example.com/bucket/bricks-media/a.webp');

        expect(sendMock).toHaveBeenCalledTimes(2);
        const firstInput = (sendMock.mock.calls[0][0] as { input: Record<string, unknown> }).input;
        const secondInput = (sendMock.mock.calls[1][0] as { input: Record<string, unknown> }).input;
        expect(firstInput.ContinuationToken).toBeUndefined();
        expect(firstInput.Prefix).toBe('bricks-media/');
        expect(secondInput.ContinuationToken).toBe('token-1');
    });

    it('одна страница без IsTruncated — один запрос', async () => {
        sendMock.mockResolvedValueOnce({
            Contents: [makeObject('bricks-media/a.webp')],
            IsTruncated: false,
        });

        const files = await createS3PublishAdapter().listFiles();

        expect(files).toHaveLength(1);
        expect(sendMock).toHaveBeenCalledTimes(1);
    });
});
