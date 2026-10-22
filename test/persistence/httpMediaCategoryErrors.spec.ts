// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import { createHttpStorageAdapter } from '../../src/runtime/modules/persistence/server/http/httpStorageAdapter';
import { BricksBackendRequestError } from '../../src/runtime/modules/persistence/server/http/httpClient';
import {
    BricksStorageWriteRejectedError,
    BricksUnknownMediaCategoryError,
} from '../../src/runtime/modules/persistence/server/utils/storageErrors';
// #endregion

// #region Constants
const BASE_URL = 'https://api.example.com/my-cms';

/** Payload регистрации файла с категорией, которой уже нет. */
const CREATE_PAYLOAD = {
    url: 'https://s3/x.webp',
    filename: 'x.webp',
    size: 10,
    mimeType: 'image/webp',
    category: 'gone',
};
// #endregion

// #region Helpers
const fetchMock = vi.fn();

/**
 * JSON-ответ external backend для fetch-мока.
 *
 * @param body - Тело ответа.
 * @param status - HTTP-статус.
 * @returns Ответ fetch.
 */
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/**
 * Ответ отказа с машиночитаемым кодом в формате локальных ручек.
 *
 * @param code - Код отказа.
 * @param status - HTTP-статус.
 * @returns Ответ fetch.
 */
function errorResponse(code: string, status: number): Response {
    return jsonResponse({ data: { code } }, status);
}

/**
 * Создаёт адаптер поверх замоканного fetch.
 *
 * @returns HTTP-адаптер хранилища.
 */
function createAdapter(): ReturnType<typeof createHttpStorageAdapter> {
    return createHttpStorageAdapter({ baseUrl: BASE_URL });
}
// #endregion

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('HttpStorageAdapter: контрактный отказ «категории нет»', () => {
    it('createMedia: 400 с контрактным кодом → доменная ошибка категории', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse('UNKNOWN_MEDIA_CATEGORY', 400));

        await expect(createAdapter().createMedia(CREATE_PAYLOAD)).rejects.toMatchObject({
            name: 'BricksUnknownMediaCategoryError',
            category: 'gone',
        });
    });

    it('доменный отказ категории гарантирует, что запись не применена', async () => {
        // Только под эту гарантию оркестрация загрузки вправе удалить уже
        // залитый в бакет файл
        fetchMock.mockResolvedValueOnce(errorResponse('UNKNOWN_MEDIA_CATEGORY', 400));

        await expect(createAdapter().createMedia(CREATE_PAYLOAD)).rejects.toBeInstanceOf(
            BricksStorageWriteRejectedError
        );
    });

    it('updateMedia: тот же код при смене категории', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse('UNKNOWN_MEDIA_CATEGORY', 400));

        await expect(createAdapter().updateMedia(5, { category: 'gone' })).rejects.toBeInstanceOf(
            BricksUnknownMediaCategoryError
        );
    });

    it('400 без кода остаётся неопределённым отказом: чужая валидация — не отсутствующая категория', async () => {
        // Выдать произвольный 400 за доменный значило бы соврать пользователю, а
        // заодно разрешить удаление файла при неизвестном исходе записи
        fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'bad payload' }, 400));

        await expect(createAdapter().createMedia(CREATE_PAYLOAD)).rejects.toBeInstanceOf(
            BricksBackendRequestError
        );
    });

    it('5xx с тем же кодом доменным не считается: исход записи неизвестен', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse('UNKNOWN_MEDIA_CATEGORY', 500));

        await expect(createAdapter().createMedia(CREATE_PAYLOAD)).rejects.toBeInstanceOf(
            BricksBackendRequestError
        );
    });
});
