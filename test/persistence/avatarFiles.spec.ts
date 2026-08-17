// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    buildAvatarKey,
    discardAvatarFile,
} from '../../src/runtime/modules/persistence/server/utils/avatarFiles';
// #endregion

/**
 * Файлы фото профиля живут в своём namespace хранилища и убираются best-effort:
 * ссылка из колонки к этому моменту уже снята или заменена, поэтому отказ
 * хранилища не должен превращать успешную смену фото в ошибку.
 */

// #region Fixtures
/** Publish-адаптер в объёме, который трогают эти утилиты. */
function createPublishStub(isOwned = true): {
    buildFileKey: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
    isOwnedUrl: ReturnType<typeof vi.fn>;
} {
    return {
        buildFileKey: vi.fn((kind: string, filename: string) => `bricks-${kind}s/${filename}`),
        deleteFile: vi.fn(),
        isOwnedUrl: vi.fn(() => isOwned),
    };
}
// #endregion

describe('buildAvatarKey: ключ файла фото', () => {
    it('просит namespace аватаров, а не медиатеки', () => {
        // Медиатека показала бы аватары в галерее — под удаление любым редактором
        const publish = createPublishStub();
        const key = buildAvatarKey(publish, 7);

        expect(publish.buildFileKey).toHaveBeenCalledWith(
            'avatar',
            expect.stringMatching(/^user-7-[0-9a-f-]+\.webp$/)
        );
        expect(key).toMatch(/^bricks-avatars\/user-7-[0-9a-f-]+\.webp$/);
    });

    it('даёт разные ключи на каждую загрузку', () => {
        // Один перезаписываемый ключ оставлял бы браузеры и CDN с прежним фото, а
        // компенсация неподтверждённой записи в `uploadFile` снесла бы живой файл
        const publish = createPublishStub();

        expect(buildAvatarKey(publish, 7)).not.toBe(buildAvatarKey(publish, 7));
    });
});

describe('discardAvatarFile: уборка осиротевшего файла', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('удаляет свой файл', async () => {
        const publish = createPublishStub();

        await discardAvatarFile(publish, 'https://s3.example/bucket/bricks-avatars/user-7-a.webp');

        expect(publish.deleteFile).toHaveBeenCalledWith(
            'https://s3.example/bucket/bricks-avatars/user-7-a.webp'
        );
    });

    it('ничего не делает без ссылки', async () => {
        const publish = createPublishStub();

        await discardAvatarFile(publish, null);
        await discardAvatarFile(publish, '');

        expect(publish.deleteFile).not.toHaveBeenCalled();
    });

    it('не трогает чужой URL', async () => {
        // В колонке может лежать значение, поставленное прежней версией или руками:
        // `deleteFile` на чужом URL бросает, и это дало бы шумную запись в логе
        // вместо тихого пропуска
        const publish = createPublishStub(false);

        await discardAvatarFile(publish, 'https://evil.example/avatar.webp');

        expect(publish.isOwnedUrl).toHaveBeenCalledWith('https://evil.example/avatar.webp');
        expect(publish.deleteFile).not.toHaveBeenCalled();
    });

    it('гасит и отказ самой проверки принадлежности', async () => {
        // `isOwnedUrl` дефолтного адаптера резолвит конфигурацию хранилища и
        // бросает на несконфигурированном бакете. Снаружи `try` этот отказ
        // доходил бы до клиента пятисотым уже ПОСЛЕ применённой правки: учётка
        // удалена, ответ «ошибка», повтор отвечает 404
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const publish = createPublishStub();
        publish.isOwnedUrl.mockImplementation(() => {
            throw new Error('[S3] Bucket is not configured');
        });

        await expect(
            discardAvatarFile(publish, 'https://s3.example/bucket/bricks-avatars/user-7-a.webp')
        ).resolves.toBeUndefined();

        expect(publish.deleteFile).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });

    it('гасит отказ хранилища: правка профиля уже применена', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const publish = createPublishStub();
        publish.deleteFile.mockRejectedValue(new Error('storage is down'));

        await expect(
            discardAvatarFile(publish, 'https://s3.example/bucket/bricks-avatars/user-7-a.webp')
        ).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalled();
    });
});
