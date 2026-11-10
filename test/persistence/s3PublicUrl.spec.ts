/**
 * File links are built from `publicUrl` when it is set.
 *
 * A storage may refuse anonymous reads on its API address: Selectel answers 403 on
 * `<endpoint>/<bucket>/<key>` even for a `public-read` object and serves it only from the
 * bucket's own domain. The whole chain is checked: the links of an upload and of a listing
 * come from the public address, deletion and the proxy accept them as their own, and a link
 * through the API address no longer is.
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
    ListObjectsV2Command: class {
        kind = 'list';

        constructor(public input: Record<string, unknown>) {}
    },
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

import { createS3PublishAdapter } from '../../src/runtime/modules/persistence/server/s3/s3PublishAdapter';
// #endregion

/** A storage readable only from the bucket's public domain. */
const S3_CONFIG = {
    endpoint: 'https://s3.example.com',
    region: 'region-1',
    bucket: 'bucket',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    prefix: 'site/media/',
    thumbnailsPrefix: 'site/thumbnails/',
    avatarsPrefix: 'site/avatars/',
    publicUrl: 'https://files.example.net/',
};

describe('s3PublishAdapter: publicUrl', () => {
    beforeEach(() => {
        sendMock.mockReset();
        runtimeConfigMock.mockReset();
        runtimeConfigMock.mockReturnValue({ bricksS3: S3_CONFIG });
    });

    it('returns the upload link on the public address and deletes by it', async () => {
        sendMock.mockResolvedValue({});

        const adapter = createS3PublishAdapter();
        const uploaded = await adapter.uploadFile({
            buffer: Buffer.from('binary'),
            mimeType: 'image/webp',
            key: 'site/media/uuid.webp',
        });

        expect(uploaded.url).toBe('https://files.example.net/site/media/uuid.webp');

        await adapter.deleteFile(uploaded.url);

        const deleteCommand = sendMock.mock.calls.at(-1)?.[0];

        expect(deleteCommand.kind).toBe('delete');
        expect(deleteCommand.input).toEqual({ Bucket: 'bucket', Key: 'site/media/uuid.webp' });
    });

    it('lists files with links on the public address', async () => {
        sendMock.mockResolvedValue({
            Contents: [{ Key: 'site/media/a.webp', Size: 3 }, { Key: 'site/media/' }],
            IsTruncated: false,
        });

        const files = await createS3PublishAdapter().listFiles();

        expect(files.map((file) => file.url)).toEqual([
            'https://files.example.net/site/media/a.webp',
        ]);
    });

    it('does not own a link through the API address once publicUrl is set', async () => {
        const adapter = createS3PublishAdapter();

        expect(adapter.isOwnedUrl('https://files.example.net/site/media/uuid.webp')).toBe(true);
        expect(adapter.isOwnedUrl('https://s3.example.com/bucket/site/media/uuid.webp')).toBe(
            false
        );
        await expect(
            adapter.deleteFile('https://s3.example.com/bucket/site/media/uuid.webp')
        ).rejects.toThrow(/Invalid storage URL/);
        expect(sendMock).not.toHaveBeenCalled();
    });

    it('keeps links on the API address without publicUrl', async () => {
        sendMock.mockResolvedValue({});
        runtimeConfigMock.mockReturnValue({ bricksS3: { ...S3_CONFIG, publicUrl: '' } });

        const uploaded = await createS3PublishAdapter().uploadFile({
            buffer: Buffer.from('binary'),
            mimeType: 'image/webp',
            key: 'site/media/uuid.webp',
        });

        expect(uploaded.url).toBe('https://s3.example.com/bucket/site/media/uuid.webp');
    });

    it('rejects a publicUrl with a query without echoing it: the key would turn into the query', () => {
        runtimeConfigMock.mockReturnValue({
            bricksS3: { ...S3_CONFIG, publicUrl: 'https://files.example.net/?token=1' },
        });

        expect(() => createS3PublishAdapter().buildFileKey('media', 'uuid.webp')).toThrow(
            /Invalid public URL/
        );
        expect(() => createS3PublishAdapter().buildFileKey('media', 'uuid.webp')).not.toThrow(
            /token/
        );
    });
});
