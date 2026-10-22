/**
 * Фото профиля живёт в собственном managed-префиксе бакета.
 *
 * Проверяются обе половины решения: ключ строится в своём namespace (а не в
 * медиатеке, где аватары попали бы в галерею и под удаление любым редактором) и
 * этот namespace признан своим — иначе `uploadFile` и `deleteFile` отказали бы
 * собственным же файлам, и фото нельзя было бы ни поставить, ни снять.
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
        constructor(public input: Record<string, unknown>) {}
    },
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

import { createS3PublishAdapter } from '../../src/runtime/modules/persistence/server/s3/s3PublishAdapter';
// #endregion

/** Конфигурация без явного префикса аватаров — проверяем и дефолт. */
const S3_CONFIG_WITHOUT_AVATARS = {
    endpoint: 'https://storage.example.com',
    bucket: 'bucket',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    prefix: 'bricks-media/',
    thumbnailsPrefix: 'bricks-thumbnails/',
};

describe('s3PublishAdapter: namespace фото профиля', () => {
    beforeEach(() => {
        sendMock.mockReset();
        runtimeConfigMock.mockReset();
        runtimeConfigMock.mockReturnValue({ bricksS3: S3_CONFIG_WITHOUT_AVATARS });
    });

    it('кладёт аватар под свой дефолтный префикс', () => {
        const adapter = createS3PublishAdapter();

        expect(adapter.buildFileKey('avatar', 'user-7-uuid.webp')).toBe(
            'bricks-avatars/user-7-uuid.webp'
        );
        // Медиа и превью остались там же, где были
        expect(adapter.buildFileKey('media', 'uuid.webp')).toBe('bricks-media/uuid.webp');
        expect(adapter.buildFileKey('thumbnail', 'page-1-uuid.webp')).toBe(
            'bricks-thumbnails/page-1-uuid.webp'
        );
    });

    it('уважает свой префикс из конфигурации', () => {
        runtimeConfigMock.mockReturnValue({
            bricksS3: { ...S3_CONFIG_WITHOUT_AVATARS, avatarsPrefix: 'faces/' },
        });

        expect(createS3PublishAdapter().buildFileKey('avatar', 'user-7-uuid.webp')).toBe(
            'faces/user-7-uuid.webp'
        );
    });

    it('признаёт URL аватара своим, а посторонний префикс — нет', () => {
        const adapter = createS3PublishAdapter();

        expect(
            adapter.isOwnedUrl('https://storage.example.com/bucket/bricks-avatars/user-7-uuid.webp')
        ).toBe(true);
        expect(
            adapter.isOwnedUrl('https://storage.example.com/bucket/someone-else/user-7-uuid.webp')
        ).toBe(false);
        // Сам префикс — не файл
        expect(adapter.isOwnedUrl('https://storage.example.com/bucket/bricks-avatars/')).toBe(
            false
        );
    });

    it('заливает и удаляет файл аватара', async () => {
        sendMock.mockResolvedValue({});

        const adapter = createS3PublishAdapter();
        const uploaded = await adapter.uploadFile({
            buffer: Buffer.from('binary'),
            mimeType: 'image/webp',
            key: 'bricks-avatars/user-7-uuid.webp',
        });

        expect(uploaded.url).toBe(
            'https://storage.example.com/bucket/bricks-avatars/user-7-uuid.webp'
        );

        await expect(adapter.deleteFile(uploaded.url)).resolves.toBeUndefined();
    });

    it('отказывает на вложенных префиксах: изоляция держится на непересечении', async () => {
        // `prefix: 'bricks/'` рядом с `avatarsPrefix: 'bricks/avatars/'` выглядит
        // естественно, но листинг медиатеки (по `prefix`) увидел бы аватары как
        // медиа: импорт бакета зарегистрировал бы фото в галерее, а оттуда их
        // удалил бы любой редактор. Отказ громкий — молчание было бы ложью
        runtimeConfigMock.mockReturnValue({
            bricksS3: {
                ...S3_CONFIG_WITHOUT_AVATARS,
                prefix: 'bricks/',
                avatarsPrefix: 'bricks/avatars/',
            },
        });

        expect(() => createS3PublishAdapter().buildFileKey('avatar', 'user-7-uuid.webp')).toThrow(
            /Invalid managed prefixes/
        );
    });

    it('отказывает на совпадающих префиксах и на префиксе без завершающего слеша', async () => {
        runtimeConfigMock.mockReturnValue({
            bricksS3: { ...S3_CONFIG_WITHOUT_AVATARS, avatarsPrefix: 'bricks-media/' },
        });

        expect(() => createS3PublishAdapter().buildFileKey('avatar', 'user-7-uuid.webp')).toThrow(
            /Invalid managed prefixes/
        );

        // Без слеша namespace перестаёт быть каталогом: `bricks-media` сделал бы
        // своим и `bricks-media-archive/x`
        runtimeConfigMock.mockReturnValue({
            bricksS3: { ...S3_CONFIG_WITHOUT_AVATARS, avatarsPrefix: 'bricks-avatars' },
        });

        expect(() => createS3PublishAdapter().buildFileKey('avatar', 'user-7-uuid.webp')).toThrow(
            /Invalid managed prefixes/
        );
    });

    it('не даёт залить аватар мимо namespace', async () => {
        // Ключ обязан быть построен `buildFileKey`: произвольный путь в
        // shared-бакете — не наш объект
        await expect(
            createS3PublishAdapter().uploadFile({
                buffer: Buffer.from('binary'),
                mimeType: 'image/webp',
                key: 'avatars/user-7-uuid.webp',
            })
        ).rejects.toThrowError(/managed prefixes/);

        expect(sendMock).not.toHaveBeenCalled();
    });
});
