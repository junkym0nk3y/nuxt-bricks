// #region Imports
// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
import type {
    ICreateMediaPayload,
    IUploadFileParams,
} from '../../src/runtime/modules/persistence/types/adapters';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    uploadAndRegisterMedia,
    deleteMediaWithFile,
    cleanupPageThumbnail,
    type IMediaOrchestrationDeps,
    type IUploadMediaParams,
} from '../../src/runtime/modules/persistence/server/utils/mediaOrchestration';
import {
    BricksStatementTimeoutError,
    BricksStorageWriteRejectedError,
    BricksUnknownMediaCategoryError,
} from '../../src/runtime/modules/persistence/server/utils/storageErrors';
// #endregion

// #region Fakes
/** Медиа-запись для фейкового storage. */
function makeMediaItem(overrides: Partial<IMediaItem> = {}): IMediaItem {
    return {
        id: 7,
        url: 'https://storage.example.com/my-bucket/bricks-media/a.webp',
        filename: 'a.webp',
        alt: '',
        size: 1024,
        uploadedAt: '2026-07-10T00:00:00.000Z',
        mimeType: 'image/webp',
        category: 'other',
        svgContent: null,
        width: null,
        height: null,
        previewUrl: null,
        mockUrl: null,
        ...overrides,
    };
}

/**
 * Журналируемые фейки адаптеров: каждый вызов пишется в calls.
 *
 * `createMediaErrors` — очередь отказов по попыткам: первый элемент достаётся
 * первому вызову, второй — повтору. Пустое место в очереди означает успех.
 */
function makeDeps(overrides: {
    getMedia?: IMediaItem | null;
    createMediaError?: Error;
    createMediaErrors?: (Error | null)[];
    deleteFileError?: Error;
    isOwned?: boolean;
}): { deps: IMediaOrchestrationDeps; calls: string[] } {
    const calls: string[] = [];
    const createErrors = overrides.createMediaErrors ?? [];
    let createAttempt = 0;

    const deps: IMediaOrchestrationDeps = {
        storage: {
            async getMedia(id: number): Promise<IMediaItem | null> {
                calls.push(`getMedia:${id}`);
                return overrides.getMedia ?? null;
            },
            async createMedia(payload: ICreateMediaPayload): Promise<IMediaItem> {
                calls.push(`createMedia:${payload.url}`);
                const queuedError = createErrors[createAttempt];
                createAttempt += 1;

                if (queuedError) {
                    throw queuedError;
                }

                if (overrides.createMediaError) {
                    throw overrides.createMediaError;
                }
                return makeMediaItem({ url: payload.url, filename: payload.filename });
            },
            async deleteMedia(id: number): Promise<boolean> {
                calls.push(`deleteMedia:${id}`);
                return true;
            },
        },
        publish: {
            buildFileKey(kind, filename): string {
                calls.push(`buildFileKey:${kind}:${filename}`);
                return `${kind === 'media' ? 'bricks-media/' : 'bricks-thumbnails/'}${filename}`;
            },
            async uploadFile(params: IUploadFileParams) {
                calls.push(`uploadFile:${params.key}`);
                return {
                    url: `https://storage.example.com/my-bucket/${params.key}`,
                    key: params.key,
                    size: params.buffer.length,
                };
            },
            async deleteFile(url: string): Promise<void> {
                calls.push(`deleteFile:${url}`);
                if (overrides.deleteFileError) {
                    throw overrides.deleteFileError;
                }
            },
            isOwnedUrl(url: string): boolean {
                calls.push(`isOwnedUrl:${url}`);
                return overrides.isOwned ?? true;
            },
        },
    };

    return { deps, calls };
}

/** Загрузка изображения с одним уменьшенным вариантом. */
function makeUploadParams(): IUploadMediaParams {
    return {
        buffer: Buffer.from('binary'),
        mimeType: 'image/webp',
        storedFilename: 'uuid.webp',
        displayFilename: 'photo.webp',
        category: 'image',
        variants: {
            preview: {
                buffer: Buffer.from('preview'),
                mimeType: 'image/webp',
                storedFilename: 'uuid-preview.webp',
            },
        },
    };
}
// #endregion

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('uploadAndRegisterMedia: файл + запись одним флоу', () => {
    it('строит managed-ключ, грузит файл и регистрирует запись', async () => {
        const { deps, calls } = makeDeps({});

        const item = await uploadAndRegisterMedia(deps, {
            buffer: Buffer.from('binary'),
            mimeType: 'image/webp',
            storedFilename: 'uuid.webp',
            displayFilename: 'photo.webp',
            category: 'image',
        });

        expect(calls).toEqual([
            'buildFileKey:media:uuid.webp',
            'uploadFile:bricks-media/uuid.webp',
            'createMedia:https://storage.example.com/my-bucket/bricks-media/uuid.webp',
        ]);
        expect(item.url).toBe('https://storage.example.com/my-bucket/bricks-media/uuid.webp');
        expect(item.filename).toBe('photo.webp');
    });

    it('компенсирует по базовому маркеру, а не по конкретному классу отказа', async () => {
        // Оркестрация обязана понимать сам факт «запись отвергнута», иначе
        // адаптер не сможет сообщить его ничем, кроме известных ей классов
        const rejected = new BricksStorageWriteRejectedError('schema is missing');
        const { deps, calls } = makeDeps({ createMediaError: rejected });

        await expect(uploadAndRegisterMedia(deps, makeUploadParams())).rejects.toBe(rejected);

        expect(calls).toContain(
            'deleteFile:https://storage.example.com/my-bucket/bricks-media/uuid.webp'
        );
        expect(calls.filter((call) => call.startsWith('createMedia'))).toHaveLength(1);
    });

    it('остановка запроса лимитом времени не компенсирует сама по себе', async () => {
        // Отменён мог быть любой statement, в том числе чтение уже
        // существующей строки: гарантию даёт адаптер, обернув отказ вставки
        const { deps, calls } = makeDeps({
            createMediaErrors: [
                new BricksStatementTimeoutError(),
                new BricksStatementTimeoutError(),
            ],
        });

        await expect(uploadAndRegisterMedia(deps, makeUploadParams())).rejects.toBeInstanceOf(
            BricksStatementTimeoutError
        );

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([]);
    });

    it('компенсирует файл и варианты, когда хранилище гарантировало отказ записи', async () => {
        const rejected = new BricksUnknownMediaCategoryError('gone');
        const { deps, calls } = makeDeps({ createMediaError: rejected });

        await expect(uploadAndRegisterMedia(deps, makeUploadParams())).rejects.toBe(rejected);

        expect(calls).toContain(
            'deleteFile:https://storage.example.com/my-bucket/bricks-media/uuid.webp'
        );
        expect(calls).toContain(
            'deleteFile:https://storage.example.com/my-bucket/bricks-media/uuid-preview.webp'
        );
        // Повтора при гарантированном отказе быть не должно: он заведомо
        // упрётся в тот же отказ и лишь задержит ответ
        expect(calls.filter((call) => call.startsWith('createMedia'))).toHaveLength(1);
    });

    it('ошибка компенсации не затеняет исходный отказ записи', async () => {
        const { deps } = makeDeps({
            createMediaError: new BricksUnknownMediaCategoryError('gone'),
            deleteFileError: new Error('s3 down'),
        });

        await expect(uploadAndRegisterMedia(deps, makeUploadParams())).rejects.toThrow(
            'Unknown media category: gone'
        );
    });

    it('неизвестный исход: повтор регистрации возвращает запись, файлы остаются', async () => {
        // Ответ мог не доехать уже после коммита — повтор идемпотентен по url и
        // возвращает как уже созданную запись, так и создаёт недостающую
        const { deps, calls } = makeDeps({
            createMediaErrors: [new Error('connection terminated')],
        });

        const item = await uploadAndRegisterMedia(deps, makeUploadParams());

        expect(item.url).toBe('https://storage.example.com/my-bucket/bricks-media/uuid.webp');
        expect(calls.filter((call) => call.startsWith('createMedia'))).toHaveLength(2);
        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([]);
    });

    it('неизвестный исход и неудачный повтор: файлы сохраняются, наружу идёт первая ошибка', async () => {
        const first = new Error('connection terminated');
        const { deps, calls } = makeDeps({
            createMediaErrors: [first, new Error('connection terminated again')],
        });

        await expect(uploadAndRegisterMedia(deps, makeUploadParams())).rejects.toBe(first);

        // Удаление здесь снесло бы файлы из-под записи, которую backend мог
        // успеть закоммитить: битая плитка в галерее хуже объекта-сироты
        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([]);
    });

    it('определённый отказ ПОВТОРА не разрешает компенсацию: судьбу первой попытки он не доказывает', async () => {
        const { deps, calls } = makeDeps({
            createMediaErrors: [
                new Error('connection terminated'),
                new BricksUnknownMediaCategoryError('gone'),
            ],
        });

        await expect(uploadAndRegisterMedia(deps, makeUploadParams())).rejects.toThrow(
            'connection terminated'
        );

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([]);
    });
});

describe('deleteMediaWithFile: file-first удаление', () => {
    it('возвращает false для несуществующей записи, файлы не трогает', async () => {
        const { deps, calls } = makeDeps({ getMedia: null });

        expect(await deleteMediaWithFile(deps, 7)).toBe(false);
        expect(calls).toEqual(['getMedia:7']);
    });

    it('удаляет файл, затем запись', async () => {
        const media = makeMediaItem();
        const { deps, calls } = makeDeps({ getMedia: media });

        expect(await deleteMediaWithFile(deps, 7)).toBe(true);
        expect(calls).toEqual([
            'getMedia:7',
            `isOwnedUrl:${media.url}`,
            `deleteFile:${media.url}`,
            'deleteMedia:7',
        ]);
    });

    it('при ошибке хранилища бросает 502 и сохраняет запись (безопасный ретрай)', async () => {
        const { deps, calls } = makeDeps({
            getMedia: makeMediaItem(),
            deleteFileError: new Error('s3 down'),
        });

        await expect(deleteMediaWithFile(deps, 7)).rejects.toMatchObject({ statusCode: 502 });
        expect(calls).not.toContain('deleteMedia:7');
    });

    it('URL вне managed-хранилища: удаляет только запись, файл не трогает', async () => {
        const media = makeMediaItem({ url: 'https://cdn.example.com/external.png' });
        const { deps, calls } = makeDeps({ getMedia: media, isOwned: false });

        expect(await deleteMediaWithFile(deps, 7)).toBe(true);
        expect(calls).not.toContain(`deleteFile:${media.url}`);
        expect(calls).toContain('deleteMedia:7');
    });
});

describe('cleanupPageThumbnail: best-effort чистка превью', () => {
    it('пропускает пустой и посторонний URL', async () => {
        const { deps, calls } = makeDeps({ isOwned: false });

        await cleanupPageThumbnail(deps.publish, null);
        await cleanupPageThumbnail(deps.publish, undefined);
        await cleanupPageThumbnail(deps.publish, 'https://cdn.example.com/x.webp');

        expect(calls.filter((call) => call.startsWith('deleteFile'))).toEqual([]);
    });

    it('удаляет managed-превью (URL с cache-buster передаётся адаптеру как есть)', async () => {
        const { deps, calls } = makeDeps({});
        const url = 'https://storage.example.com/my-bucket/bricks-thumbnails/page-1.webp?v=42';

        await cleanupPageThumbnail(deps.publish, url);

        expect(calls).toContain(`deleteFile:${url}`);
    });

    it('глотает ошибку хранилища — удаление страницы не блокируется', async () => {
        const { deps } = makeDeps({ deleteFileError: new Error('s3 down') });

        await expect(
            cleanupPageThumbnail(
                deps.publish,
                'https://storage.example.com/my-bucket/bricks-thumbnails/page-1.webp'
            )
        ).resolves.toBeUndefined();
    });
});
