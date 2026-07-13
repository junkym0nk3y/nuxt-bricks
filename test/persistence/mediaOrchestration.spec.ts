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
} from '../../src/runtime/modules/persistence/server/utils/mediaOrchestration';
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
        ...overrides,
    };
}

/** Журналируемые фейки адаптеров: каждый вызов пишется в calls. */
function makeDeps(overrides: {
    getMedia?: IMediaItem | null;
    createMediaError?: Error;
    deleteFileError?: Error;
    isOwned?: boolean;
}): { deps: IMediaOrchestrationDeps; calls: string[] } {
    const calls: string[] = [];

    const deps: IMediaOrchestrationDeps = {
        storage: {
            async getMedia(id: number): Promise<IMediaItem | null> {
                calls.push(`getMedia:${id}`);
                return overrides.getMedia ?? null;
            },
            async createMedia(payload: ICreateMediaPayload): Promise<IMediaItem> {
                calls.push(`createMedia:${payload.url}`);
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

    it('компенсирует файл при ошибке записи в БД и пробрасывает ошибку', async () => {
        const dbError = new Error('db down');
        const { deps, calls } = makeDeps({ createMediaError: dbError });

        await expect(
            uploadAndRegisterMedia(deps, {
                buffer: Buffer.from('binary'),
                mimeType: 'image/webp',
                storedFilename: 'uuid.webp',
                displayFilename: 'photo.webp',
                category: 'image',
            })
        ).rejects.toThrow('db down');

        expect(calls).toContain(
            'deleteFile:https://storage.example.com/my-bucket/bricks-media/uuid.webp'
        );
    });

    it('ошибка компенсации не затеняет исходную ошибку БД', async () => {
        const { deps } = makeDeps({
            createMediaError: new Error('db down'),
            deleteFileError: new Error('s3 down'),
        });

        await expect(
            uploadAndRegisterMedia(deps, {
                buffer: Buffer.from('binary'),
                mimeType: 'image/webp',
                storedFilename: 'uuid.webp',
                displayFilename: 'photo.webp',
                category: 'image',
            })
        ).rejects.toThrow('db down');
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
