// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    createHttpStorageAdapter,
    type IHttpStorageAdapterOptions,
} from '../../src/runtime/modules/persistence/server/http/httpStorageAdapter';
import { BricksTemplateNameConflictError } from '../../src/runtime/modules/persistence/server/utils/storageErrors';
// #endregion

/**
 * Шаблонная половина HTTP-адаптера external backend: отдельным файлом от
 * `httpStorageAdapter.spec.ts` по тому же шву, что и сама реализация — у страниц
 * и шаблонов нет общих запросов, а вместе спека переросла потолок в 500 строк.
 */

// #region Constants
const BASE_URL = 'https://api.example.com/my-cms';
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
 * Создаёт адаптер поверх замоканного fetch.
 *
 * @param overrides - Переопределения опций адаптера.
 * @returns Адаптер хранилища.
 */
function createAdapter(overrides: Partial<IHttpStorageAdapterOptions> = {}) {
    return createHttpStorageAdapter({ baseUrl: BASE_URL, ...overrides });
}

/**
 * Аргументы n-го вызова fetch-мока: [url, init].
 *
 * @param index - Номер вызова.
 * @returns URL и опции запроса.
 */
function fetchCall(index = 0): { url: string; init: RequestInit } {
    const call = fetchMock.mock.calls[index] as [string, RequestInit];

    return { url: call[0], init: call[1] };
}

/**
 * Payload создания шаблона в объёме контракта.
 *
 * @returns Payload создания.
 */
function buildCreatePayload() {
    return {
        name: 'Лендинг',
        description: null,
        schema: { components: [] },
        pageMeta: { layout: null, backgroundColor: null, viewportConfig: null },
    };
}
// #endregion

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('HttpStorageAdapter: шаблоны страниц', () => {
    it('listTemplates принимает и массив, и envelope { items }', async () => {
        // Формат локальной ручки — envelope; плоский массив остаётся законным
        // ответом, как у медиа-листингов
        fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ id: 1, name: 'Лендинг' }] }));

        const fromEnvelope = await createAdapter().listTemplates();

        expect(fetchCall().url).toBe(`${BASE_URL}/templates`);
        expect(fromEnvelope).toHaveLength(1);

        fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 2, name: 'Промо' }]));

        expect(await createAdapter().listTemplates()).toHaveLength(1);
    });

    it('getTemplate → GET {base}/templates/:id, 404 → null', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: 3, name: 'Лендинг' }));

        expect(await createAdapter().getTemplate(3)).toEqual(
            expect.objectContaining({ id: 3, name: 'Лендинг' })
        );
        expect(fetchCall().url).toBe(`${BASE_URL}/templates/3`);

        fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'not found' }, 404));

        expect(await createAdapter().getTemplate(3)).toBeNull();
    });

    it('занятое имя маппится на доменный конфликт только по точному коду', async () => {
        // 409 без кода — посторонний конфликт backend'а (квота, состояние), и
        // выдавать его за занятое имя значило бы заставить форму краснеть полем
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ data: { code: 'TEMPLATE_NAME_CONFLICT' } }, 409)
        );

        await expect(createAdapter().createTemplate(buildCreatePayload())).rejects.toBeInstanceOf(
            BricksTemplateNameConflictError
        );

        fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'quota exceeded' }, 409));

        await expect(
            createAdapter().createTemplate(buildCreatePayload())
        ).rejects.not.toBeInstanceOf(BricksTemplateNameConflictError);
    });

    it('updateTemplate шлёт PATCH подписи; 404 → null', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: 4, name: 'Промо' }));

        await createAdapter().updateTemplate(4, { name: 'Промо' });

        const { url, init } = fetchCall();

        expect(url).toBe(`${BASE_URL}/templates/4`);
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(String(init.body))).toEqual({ name: 'Промо' });

        fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'not found' }, 404));

        expect(await createAdapter().updateTemplate(4, { name: 'Промо' })).toBeNull();
    });

    it('deleteTemplate отдаёт URL превью, а пустое тело — «убирать нечего»', async () => {
        // Файлы превью остаются локальными и в external-режиме: без URL ручке
        // нечем убрать осиротевший объект, но и удаление отказом считать нельзя
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ thumbnail_url: 'https://bucket.example/template-1.webp' })
        );

        expect(await createAdapter().deleteTemplate(5)).toEqual({
            thumbnailUrl: 'https://bucket.example/template-1.webp',
        });

        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

        expect(await createAdapter().deleteTemplate(5)).toEqual({ thumbnailUrl: null });

        fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'not found' }, 404));

        expect(await createAdapter().deleteTemplate(5)).toBeNull();
    });
});
