/**
 * Отсутствующая категория обязана доходить до клиента внятно, откуда бы она ни
 * пришла: от ранней проверки ручки или от внешнего ключа базы, поймавшего
 * удаление категории уже во время записи. Раньше второй путь отдавал generic
 * 500 — то самое, от чего ранняя проверка и должна была защищать.
 *
 * Тест поведенческий: проверяется ответ ручки, а не то, какой маппер она
 * импортирует. Возврат любой из ручек на общий `toHttpError` виден здесь как
 * 500 вместо 400.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
import type { IThrownHttpError } from '../helpers/types';
// #endregion

// #region Mocks
const {
    listMediaCategoriesMock,
    updateMediaMock,
    createMediaMock,
    readJsonBodyMock,
    readMultipartMock,
} = vi.hoisted(() => ({
    listMediaCategoriesMock: vi.fn(),
    updateMediaMock: vi.fn(),
    createMediaMock: vi.fn(),
    readJsonBodyMock: vi.fn(),
    readMultipartMock: vi.fn(),
}));

vi.mock('nitropack/runtime', () => ({
    useAppConfig: () => ({}),
    useRuntimeConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/defaultStorage', () => ({
    getBricksDefaultStorageFactory: () => undefined,
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksStorageAdapter: () => ({
        listMediaCategories: listMediaCategoriesMock,
        updateMedia: updateMediaMock,
        createMedia: createMediaMock,
    }),
    useBricksPublishAdapter: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/utils/requestBodyLimits', () => ({
    readJsonBodyWithLimit: readJsonBodyMock,
    collectWebStreamWithLimit: vi.fn(),
    readMultipartFormDataWithLimit: readMultipartMock,
    MULTIPART_ENVELOPE_ALLOWANCE_BYTES: 0,
}));

vi.mock('../../src/runtime/server/utils/requestRateLimiter', () => ({
    assertWithinRateLimit: vi.fn(),
    createFixedWindowRateLimiter: () => ({ hit: () => 0 }),
}));

import patchMediaHandler from '../../src/runtime/server/api/bricks/media/[id].patch';
import uploadMediaHandler from '../../src/runtime/server/api/bricks/media/upload.post';
import { BricksUnknownMediaCategoryError } from '../../src/runtime/modules/persistence/server/utils/storageErrors';
import { BRICKS_API_ERROR_CODES } from '../../src/runtime/modules/common/constants/apiErrors';
// #endregion

/**
 * Событие PATCH-запроса метаданных медиа.
 *
 * @returns Фейковое событие h3.
 */
function makePatchEvent(): H3Event {
    return {
        node: {
            req: {
                url: '/api/bricks/media/7',
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
            },
            res: { setHeader: vi.fn() },
        },
        context: { params: { id: '7' } },
    } as unknown as H3Event;
}

/**
 * Событие POST-запроса загрузки медиа.
 *
 * @returns Фейковое событие h3.
 */
function makeUploadEvent(): H3Event {
    return {
        node: {
            req: {
                url: '/api/bricks/media/upload',
                method: 'POST',
                headers: { 'content-type': 'multipart/form-data; boundary=x' },
            },
            res: { setHeader: vi.fn() },
        },
        context: {},
    } as unknown as H3Event;
}

/**
 * Вызывает ручку и возвращает выброшенную HTTP-ошибку.
 *
 * @param event - Событие запроса.
 * @returns Пойманная ошибка.
 */
async function catchHandlerError(event: H3Event): Promise<IThrownHttpError> {
    try {
        await patchMediaHandler(event);
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected handler to throw');
}

describe('PATCH метаданных медиа: отсутствующая категория', () => {
    beforeEach(() => {
        listMediaCategoriesMock.mockReset();
        updateMediaMock.mockReset();
        readJsonBodyMock.mockReset();
        readJsonBodyMock.mockResolvedValue({ category: 'gone' });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('ранняя проверка отдаёт 400 с машиночитаемым кодом', async () => {
        listMediaCategoriesMock.mockResolvedValue([{ id: 1, slug: 'photos', label: 'Photos' }]);

        const thrown = await catchHandlerError(makePatchEvent());

        expect(thrown.statusCode).toBe(400);
        expect(thrown.data?.code).toBe(BRICKS_API_ERROR_CODES.unknownMediaCategory);
        expect(updateMediaMock).not.toHaveBeenCalled();
    });

    it('отказ хранилища во время записи отдаёт тот же ответ, а не generic 500', async () => {
        // Гонка: на момент проверки категория ещё была, к моменту записи её уже
        // удалили — для клиента оба исхода обязаны выглядеть одинаково
        listMediaCategoriesMock.mockResolvedValue([{ id: 1, slug: 'gone', label: 'Gone' }]);
        updateMediaMock.mockRejectedValue(new BricksUnknownMediaCategoryError('gone'));

        const thrown = await catchHandlerError(makePatchEvent());

        expect(thrown.statusCode).toBe(400);
        expect(thrown.data?.code).toBe(BRICKS_API_ERROR_CODES.unknownMediaCategory);
    });

    it('прочий отказ хранилища остаётся generic 500', async () => {
        listMediaCategoriesMock.mockResolvedValue([{ id: 1, slug: 'gone', label: 'Gone' }]);
        updateMediaMock.mockRejectedValue(new Error('column mismatch'));

        const thrown = await catchHandlerError(makePatchEvent());

        expect(thrown.statusCode).toBe(500);
        expect(thrown.data?.code).toBeUndefined();
    });
});

describe('Загрузка медиа: отсутствующая категория', () => {
    beforeEach(() => {
        listMediaCategoriesMock.mockReset();
        createMediaMock.mockReset();
        readMultipartMock.mockReset();
        readMultipartMock.mockResolvedValue([
            { name: 'file', filename: 'photo.png', type: 'image/png', data: Buffer.from('binary') },
            { name: 'category', data: Buffer.from('gone') },
        ]);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('отдаёт 400 с тем же кодом и не платит за обработку файла', async () => {
        listMediaCategoriesMock.mockResolvedValue([{ id: 1, slug: 'photos', label: 'Photos' }]);

        let thrown: IThrownHttpError | null = null;
        try {
            await uploadMediaHandler(makeUploadEvent());
        } catch (error: unknown) {
            thrown = error as IThrownHttpError;
        }

        expect(thrown?.statusCode).toBe(400);
        expect(thrown?.data?.code).toBe(BRICKS_API_ERROR_CODES.unknownMediaCategory);
        // Оптимизация и заливка в бакет до проверки не выполняются — ради этого
        // ранняя проверка и стоит перед подготовкой файла
        expect(createMediaMock).not.toHaveBeenCalled();
    });
});
