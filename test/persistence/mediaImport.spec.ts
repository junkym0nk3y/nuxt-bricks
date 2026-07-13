// #region Imports
// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
import type { ICreateMediaPayload } from '../../src/runtime/modules/persistence/types/adapters';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { listFilesMock, createMediaMock, getMediaByUrlMock } = vi.hoisted(() => ({
    listFilesMock: vi.fn(),
    createMediaMock: vi.fn(),
    getMediaByUrlMock: vi.fn(),
}));

// mediaProcessing тянет nitropack/runtime (useRuntimeConfig) — в node-тестах стабим
vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksPublishAdapter: () => ({ listFiles: listFilesMock }),
    useBricksStorageAdapter: () => ({
        createMedia: createMediaMock,
        getMediaByUrl: getMediaByUrlMock,
    }),
}));

import { importMediaFromStorage } from '../../src/runtime/modules/persistence/server/utils/mediaImport';
// #endregion

/** Описание файла бакета для listFiles. */
function makeFile(key: string) {
    return {
        key,
        url: `https://storage.example.com/bucket/${key}`,
        size: 1024,
        lastModified: '2026-07-01T00:00:00.000Z',
    };
}

describe('importMediaFromStorage: импорт бакета без N+1', () => {
    beforeEach(() => {
        listFilesMock.mockReset();
        createMediaMock.mockReset();
        getMediaByUrlMock.mockReset();
    });

    it('создаёт запись на файл через идемпотентный createMedia, без per-file SELECT', async () => {
        listFilesMock.mockResolvedValue([
            makeFile('bricks-media/a.webp'),
            makeFile('bricks-media/b.webp'),
        ]);
        createMediaMock.mockImplementation((payload: ICreateMediaPayload) =>
            Promise.resolve({ id: 1, ...payload } as unknown as IMediaItem)
        );

        const items = await importMediaFromStorage();

        expect(items).toHaveLength(2);
        expect(createMediaMock).toHaveBeenCalledTimes(2);
        // Дедуп — контрактом уникальности url в createMedia: отдельный SELECT на файл убран
        expect(getMediaByUrlMock).not.toHaveBeenCalled();

        const payload = createMediaMock.mock.calls[0][0] as ICreateMediaPayload;
        expect(payload.url).toBe('https://storage.example.com/bucket/bricks-media/a.webp');
        expect(payload.mimeType).toBe('image/webp');
        expect(payload.uploadedAt).toBe('2026-07-01T00:00:00.000Z');
    });

    it('недоступное хранилище → пустой список без ошибки', async () => {
        listFilesMock.mockRejectedValue(new Error('S3 down'));

        await expect(importMediaFromStorage()).resolves.toEqual([]);
        expect(createMediaMock).not.toHaveBeenCalled();
    });
});
