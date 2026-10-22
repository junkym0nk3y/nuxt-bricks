// #region Imports
// Types
import type {
    IBricksPageRow,
    IPageVersionSummary,
} from '../../src/runtime/modules/common/types/bricks-api';
import type {
    IPageThumbnailPruneDeps,
    IStoredFileInfo,
} from '../../src/runtime/modules/persistence/types/adapters';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    buildPageThumbnailKey,
    prunePageThumbnails,
    prunePageThumbnailsAfterUpload,
} from '../../src/runtime/modules/persistence/server/utils/pageThumbnails';
// #endregion

// #region Fakes
const BUCKET_URL = 'https://storage.example.com/my-bucket';

/**
 * Собирает описание файла хранилища по имени внутри thumbnail-префикса.
 *
 * @param filename - Имя файла без префикса.
 * @param lastModified - Дата записи объекта; по умолчанию заведомо старая,
 * то есть вне защитного окна свежих загрузок.
 * @returns Запись листинга.
 */
function makeFile(filename: string, lastModified = '2026-01-01T00:00:00.000Z'): IStoredFileInfo {
    return {
        key: `bricks-thumbnails/${filename}`,
        url: `${BUCKET_URL}/bricks-thumbnails/${filename}`,
        size: 1024,
        lastModified,
    };
}

/** Журналируемый фейк publish-адаптера: каждый вызов пишется в calls. */
function makePublish(overrides: { files?: IStoredFileInfo[]; listError?: Error } = {}): {
    publish: Parameters<typeof prunePageThumbnails>[0];
    calls: string[];
} {
    const calls: string[] = [];

    const publish = {
        buildFileKey(kind: 'media' | 'thumbnail', filename: string): string {
            return `${kind === 'media' ? 'bricks-media/' : 'bricks-thumbnails/'}${filename}`;
        },
        async listFiles(prefix?: string): Promise<IStoredFileInfo[]> {
            calls.push(`listFiles:${prefix}`);
            if (overrides.listError) {
                throw overrides.listError;
            }
            // Хранилище отдаёт только объекты запрошенного префикса — фейк обязан
            // вести себя так же, иначе тест не заметит промаха по префиксу
            return (overrides.files ?? []).filter((file) => file.key.startsWith(prefix ?? ''));
        },
        async deleteFile(url: string): Promise<void> {
            calls.push(`deleteFile:${url}`);
        },
    };

    return { publish, calls };
}

/**
 * Строка страницы: для уборки значим только кадр превью.
 *
 * @param thumbnailUrl - Кадр страницы.
 * @returns Строка bricks_pages.
 */
function makePageRow(thumbnailUrl: string | null): IBricksPageRow {
    return { id: 3, thumbnailUrl } as IBricksPageRow;
}

/**
 * Storage-фейк для сбора keep-list с журналом порядка чтений.
 *
 * @param pageThumbnailUrl - Кадр страницы, который отдаст `getPage` (null —
 * страницы уже нет).
 * @param versionThumbnailUrls - Кадры версий, которые отдаст список.
 * @param listError - Отказ чтения списка версий вместо ответа.
 * @returns Storage-фейк и журнал вызовов.
 */
function makeStorage(
    pageThumbnailUrl: string | null,
    versionThumbnailUrls: (string | null)[],
    listError?: Error
): { storage: IPageThumbnailPruneDeps['storage']; calls: string[] } {
    const calls: string[] = [];

    const storage = {
        async getPage(): Promise<IBricksPageRow | null> {
            calls.push('getPage');

            return pageThumbnailUrl === null ? null : makePageRow(pageThumbnailUrl);
        },
        async listPageVersions(): Promise<IPageVersionSummary[]> {
            calls.push('listPageVersions');

            if (listError) {
                throw listError;
            }

            return versionThumbnailUrls.map((thumbnailUrl, index) => ({
                id: index + 1,
                pageId: 3,
                thumbnailUrl,
                pageUpdatedAt: null,
                createdAt: '2026-07-01T00:00:00.000Z',
            }));
        },
    };

    return { storage, calls };
}
// #endregion

describe('buildPageThumbnailKey: уникальный на загрузку ключ кадра', () => {
    it('кладёт файл в thumbnail-namespace под именем page-<id>-<uuid>.webp', () => {
        const { publish } = makePublish();

        const key = buildPageThumbnailKey(publish, 12);

        expect(key).toMatch(
            /^bricks-thumbnails\/page-12-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/
        );
    });

    it('каждая загрузка получает свой ключ — иначе версии показывали бы последний кадр', () => {
        const { publish } = makePublish();

        expect(buildPageThumbnailKey(publish, 12)).not.toBe(buildPageThumbnailKey(publish, 12));
    });
});

describe('prunePageThumbnails: уборка кадров, на которые никто не ссылается', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('листает оба префикса своей страницы и только свои (page-1 не накрывает page-12)', async () => {
        const foreign = makeFile('page-12-a.webp');
        const foreignLegacy = makeFile('page-12.webp');
        const { publish, calls } = makePublish({ files: [foreign, foreignLegacy] });

        await prunePageThumbnails(publish, 1, []);

        expect(calls).toEqual([
            'listFiles:bricks-thumbnails/page-1-',
            'listFiles:bricks-thumbnails/page-1.',
        ]);
    });

    it('удаляет только файлы вне списка нужных URL', async () => {
        const kept = makeFile('page-3-keep.webp');
        const orphan = makeFile('page-3-orphan.webp');
        const { publish, calls } = makePublish({ files: [kept, orphan] });

        await prunePageThumbnails(publish, 3, [kept.url]);

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([
            `deleteFile:${orphan.url}`,
        ]);
    });

    it('кадр прежнего формата (page-<id>.webp) убирается, когда на него больше не ссылаются', async () => {
        const legacy = makeFile('page-3.webp');
        const current = makeFile('page-3-new.webp');
        const { publish, calls } = makePublish({ files: [legacy, current] });

        await prunePageThumbnails(publish, 3, [current.url]);

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([
            `deleteFile:${legacy.url}`,
        ]);
    });

    it('кадр прежнего формата не трогается, пока на него ссылается версия', async () => {
        const legacy = makeFile('page-3.webp');
        const current = makeFile('page-3-new.webp');
        const { publish, calls } = makePublish({ files: [legacy, current] });

        await prunePageThumbnails(publish, 3, [current.url, `${legacy.url}?v=1754006400000`]);

        expect(calls.some((call) => call.startsWith('deleteFile'))).toBe(false);
    });

    it('cache-buster в сохранённом URL не делает живой кадр сиротой', async () => {
        const kept = makeFile('page-3-keep.webp');
        const { publish, calls } = makePublish({ files: [kept] });

        await prunePageThumbnails(publish, 3, [`${kept.url}?v=1754006400000`]);

        expect(calls.some((call) => call.startsWith('deleteFile'))).toBe(false);
    });

    it('пустой список нужных URL (удаление страницы) сносит все кадры страницы', async () => {
        const first = makeFile('page-3-a.webp');
        const second = makeFile('page-3-b.webp');
        const { publish, calls } = makePublish({ files: [first, second] });

        await prunePageThumbnails(publish, 3, [null, undefined]);

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([
            `deleteFile:${first.url}`,
            `deleteFile:${second.url}`,
        ]);
    });

    it('свежая загрузка не считается сиротой: её URL мог ещё не доехать до БД', async () => {
        // Параллельное сохранение той же страницы: файл уже в хранилище, а PATCH
        // с его URL ещё в пути — без защиты соседняя уборка снесла бы живой кадр
        const inFlight = makeFile('page-3-in-flight.webp', new Date().toISOString());
        const { publish, calls } = makePublish({ files: [inFlight] });

        await prunePageThumbnails(publish, 3, []);

        expect(calls.some((call) => call.startsWith('deleteFile'))).toBe(false);
    });

    it('удаление страницы снимает защиту свежих: следующего прохода уборки не будет', async () => {
        const inFlight = makeFile('page-3-in-flight.webp', new Date().toISOString());
        const { publish, calls } = makePublish({ files: [inFlight] });

        await prunePageThumbnails(publish, 3, [], { includeRecentUploads: true });

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([
            `deleteFile:${inFlight.url}`,
        ]);
    });

    it('в финальном проходе отказ удаления повторяется: другого прохода не будет', async () => {
        // Обычная уборка гоняется после каждой загрузки кадра, и второй шанс у неё
        // есть по природе. Проход удалённой страницы — последний, и отказ здесь
        // оставил бы кадр в хранилище навсегда
        const orphan = makeFile('page-3-orphan.webp', '2020-01-01T00:00:00.000Z');
        const { publish, calls } = makePublish({ files: [orphan] });
        const deleteFile = vi
            .fn()
            .mockRejectedValueOnce(new Error('connection refused'))
            .mockResolvedValueOnce(undefined);
        publish.deleteFile = async (url: string): Promise<void> => {
            calls.push(`deleteFile:${url}`);
            await deleteFile(url);
        };

        await prunePageThumbnails(publish, 3, [], { includeRecentUploads: true });

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([
            `deleteFile:${orphan.url}`,
            `deleteFile:${orphan.url}`,
        ]);
    });

    it('в обычном проходе отказ не повторяется: файл предложат следующей загрузке', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const orphan = makeFile('page-3-orphan.webp', '2020-01-01T00:00:00.000Z');
        const { publish, calls } = makePublish({ files: [orphan] });
        publish.deleteFile = async (url: string): Promise<void> => {
            calls.push(`deleteFile:${url}`);
            throw new Error('connection refused');
        };

        await prunePageThumbnails(publish, 3, []);

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toHaveLength(1);

        warn.mockRestore();
    });

    it('нечитаемая дата объекта трактуется как свежесть — живой кадр дороже сироты', async () => {
        const broken = makeFile('page-3-broken-date.webp', 'not-a-date');
        const { publish, calls } = makePublish({ files: [broken] });

        await prunePageThumbnails(publish, 3, []);

        expect(calls.some((call) => call.startsWith('deleteFile'))).toBe(false);
    });

    it('несконфигурированное хранилище публикации: тихий выход без листинга и предупреждений', async () => {
        const { publish, calls } = makePublish();
        publish.buildFileKey = (): string => {
            throw new Error('[S3] Bucket is not configured.');
        };

        await expect(prunePageThumbnails(publish, 3, [])).resolves.toBeUndefined();
        expect(calls).toEqual([]);
        // Удаление страницы на установке без S3 — обычная операция, а не инцидент
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('отказ листинга не пробрасывается: превью — вторичный артефакт', async () => {
        const { publish } = makePublish({ listError: new Error('S3 unavailable') });

        await expect(prunePageThumbnails(publish, 3, [])).resolves.toBeUndefined();
    });

    it('отказ удаления одного файла не отменяет удаление остальных', async () => {
        const failing = makeFile('page-3-a.webp');
        const rest = makeFile('page-3-b.webp');
        const { publish, calls } = makePublish({ files: [failing, rest] });
        const original = publish.deleteFile;
        publish.deleteFile = async (url: string): Promise<void> => {
            if (url === failing.url) {
                calls.push(`deleteFile:${url}`);
                throw new Error('AccessDenied');
            }
            return original(url);
        };

        await prunePageThumbnails(publish, 3, []);

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([
            `deleteFile:${failing.url}`,
            `deleteFile:${rest.url}`,
        ]);
    });
});

describe('prunePageThumbnailsAfterUpload: keep-list, собранный по живым источникам', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('кадр восстановленной версии переживает откат, легший между чтениями', async () => {
        // Откат одной транзакцией ставит странице кадр выбранной версии, а саму
        // версию может унести лимит истории (откат к старейшей на заполненной
        // истории). Прочитанный до отката кадр страницы такого файла не знает,
        // список версий — уже тоже: спасает только повторное чтение страницы
        const evicted = makeFile('page-3-evicted.webp');
        const restored = makeFile('page-3-restored.webp');
        const uploaded = makeFile('page-3-uploaded.webp');
        const orphan = makeFile('page-3-orphan.webp');
        const { publish, calls } = makePublish({
            files: [evicted, restored, uploaded, orphan],
        });
        const { storage } = makeStorage(restored.url, [evicted.url]);

        await prunePageThumbnailsAfterUpload({ storage, publish }, 3, uploaded.url, evicted.url);

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([
            `deleteFile:${orphan.url}`,
        ]);
    });

    it('страница читается после списка версий: между ними тоже может лечь откат', async () => {
        const { publish } = makePublish();
        const { storage, calls } = makeStorage(null, []);

        await prunePageThumbnailsAfterUpload(
            { storage, publish },
            3,
            'https://storage.example.com/my-bucket/bricks-thumbnails/page-3-uploaded.webp',
            null
        );

        expect(calls).toEqual(['listPageVersions', 'getPage']);
    });

    it('отказ чтения БД не роняет загрузку снимка и не удаляет ничего', async () => {
        const orphan = makeFile('page-3-orphan.webp');
        const { publish, calls } = makePublish({ files: [orphan] });
        const { storage } = makeStorage(null, [], new Error('Postgres unavailable'));

        await expect(
            prunePageThumbnailsAfterUpload({ storage, publish }, 3, orphan.url, null)
        ).resolves.toBeUndefined();
        expect(calls.some((call) => call.startsWith('deleteFile'))).toBe(false);
    });
});
