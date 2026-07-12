// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    createHttpStorageAdapter,
    type IHttpStorageAdapterOptions,
} from '../src/runtime/modules/persistence/server/http/httpStorageAdapter';
import {
    createBackendHttpClient,
    BricksBackendRequestError,
} from '../src/runtime/modules/persistence/server/http/httpClient';
import {
    BricksPagenameConflictError,
    BricksRevisionConflictError,
} from '../src/runtime/modules/persistence/server/utils/storageErrors';
import { toPublicPageProjection } from '../src/runtime/modules/persistence/server/utils/publicProjection';

// Types
import type { IBricksPageRow } from '../src/runtime/modules/common/types/bricks-api';
// #endregion

// #region Constants
const BASE_URL = 'https://api.example.com/my-cms';
// #endregion

// #region Helpers
const fetchMock = vi.fn();

/**
 * JSON-ответ external backend для fetch-мока.
 */
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/**
 * Создаёт адаптер поверх замоканного fetch.
 */
function createAdapter(overrides: Partial<IHttpStorageAdapterOptions> = {}) {
    return createHttpStorageAdapter({ baseUrl: BASE_URL, ...overrides });
}

/**
 * Аргументы n-го вызова fetch-мока: [url, init].
 */
function fetchCall(index = 0): { url: string; init: RequestInit } {
    const call = fetchMock.mock.calls[index] as [string, RequestInit];

    return { url: call[0], init: call[1] };
}
// #endregion

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('HttpStorageAdapter: маппинг методов на контрактные ручки', () => {
    it('listPages → GET {base}', async () => {
        fetchMock.mockResolvedValue(jsonResponse([]));

        await createAdapter().listPages();

        const { url, init } = fetchCall();
        expect(url).toBe(BASE_URL);
        expect(init.method).toBe('GET');
    });

    it('getPage → GET {base}/:id', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 7 }));

        await createAdapter().getPage(7);

        expect(fetchCall().url).toBe(`${BASE_URL}/7`);
    });

    it('getPageByPagename → GET {base}/public/pages/:pagename с URL-энкодингом', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 1, pagename: 'о нас' }));

        await createAdapter().getPageByPagename('о нас');

        expect(fetchCall().url).toBe(`${BASE_URL}/public/pages/${encodeURIComponent('о нас')}`);
    });

    it('createPage → POST {base} с JSON-телом', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 1, pagename: 'landing' }));

        await createAdapter().createPage({ pagename: 'landing', schema: { components: [] } });

        const { url, init } = fetchCall();
        expect(url).toBe(BASE_URL);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({
            pagename: 'landing',
            schema: { components: [] },
        });
    });

    it('updatePage → PATCH {base}/:id (partial-семантика, expectedRevision в теле)', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 3 }));

        await createAdapter().updatePage(3, { title: 'T', expectedRevision: 4 });

        const { url, init } = fetchCall();
        expect(url).toBe(`${BASE_URL}/3`);
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(init.body as string)).toEqual({ title: 'T', expectedRevision: 4 });
    });

    it('deletePage → DELETE {base}/:id; версии → GET {base}/:id/versions[/:versionId]', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ id: 11 }));

        const adapter = createAdapter();
        await adapter.deletePage(3);
        await adapter.listPageVersions(3);
        await adapter.getPageVersion(3, 11);

        expect(fetchCall(0).url).toBe(`${BASE_URL}/3`);
        expect(fetchCall(0).init.method).toBe('DELETE');
        expect(fetchCall(1).url).toBe(`${BASE_URL}/3/versions`);
        expect(fetchCall(2).url).toBe(`${BASE_URL}/3/versions/11`);
    });

    it('media: list/create/update/delete → {base}/media[...]', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ id: 5, url: 'https://s3/x.webp' }))
            .mockResolvedValueOnce(jsonResponse({ id: 5 }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));

        const adapter = createAdapter();
        await adapter.listMedia();
        await adapter.createMedia({
            url: 'https://s3/x.webp',
            filename: 'x.webp',
            size: 10,
            mimeType: 'image/webp',
            category: 'photo',
        });
        await adapter.updateMedia(5, { alt: 'alt' });
        await adapter.deleteMedia(5);

        expect(fetchCall(0).url).toBe(`${BASE_URL}/media`);
        expect(fetchCall(1).init.method).toBe('POST');
        expect(fetchCall(2).url).toBe(`${BASE_URL}/media/5`);
        expect(fetchCall(2).init.method).toBe('PATCH');
        expect(fetchCall(3).init.method).toBe('DELETE');
    });
});

describe('HttpStorageAdapter: заголовки server-to-server запросов', () => {
    it('Bearer-токен добавляется при заданном token, browser identity не пробрасывается', async () => {
        fetchMock.mockResolvedValue(jsonResponse([]));

        await createAdapter({ token: 'secret-token' }).listPages();

        const headers = fetchCall().init.headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer secret-token');
        expect(headers.cookie).toBeUndefined();
        expect(fetchCall().init.redirect).toBe('error');
    });

    it('без токена заголовок authorization отсутствует; content-type — только у запросов с телом', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ id: 1 })));

        const adapter = createAdapter();
        await adapter.getPage(1);
        await adapter.updatePage(1, { title: 'T' });

        const getHeaders = fetchCall(0).init.headers as Record<string, string>;
        expect(getHeaders.authorization).toBeUndefined();
        expect(getHeaders['content-type']).toBeUndefined();

        const patchHeaders = fetchCall(1).init.headers as Record<string, string>;
        expect(patchHeaders['content-type']).toBe('application/json');
    });
});

describe('HttpStorageAdapter: нормализация формата ответов', () => {
    it('top-level ключи snake_case → camelCase; вложенная schema не трогается', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                id: 1,
                pagename: 'landing',
                background_color: '#fff',
                thumbnail_url: 'https://s3/t.webp',
                created_at: '2026-07-12T00:00:00.000Z',
                schema: { components: [{ component_name: 'BlockText', nested_key: 1 }] },
            })
        );

        const page = await createAdapter().getPage(1);

        expect(page).toMatchObject({
            backgroundColor: '#fff',
            thumbnailUrl: 'https://s3/t.webp',
            createdAt: '2026-07-12T00:00:00.000Z',
        });
        expect(page?.schema).toEqual({
            components: [{ component_name: 'BlockText', nested_key: 1 }],
        });
    });

    it('listMedia принимает и плоский массив, и envelope { items } локального формата', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse([{ id: 1, mime_type: 'image/webp' }]))
            .mockResolvedValueOnce(jsonResponse({ items: [{ id: 2, mime_type: 'video/mp4' }] }));

        const adapter = createAdapter();
        const flat = await adapter.listMedia();
        const enveloped = await adapter.listMedia();

        expect(flat).toEqual([{ id: 1, mimeType: 'image/webp' }]);
        expect(enveloped).toEqual([{ id: 2, mimeType: 'video/mp4' }]);
    });

    it('не-массив там, где ожидается список, — понятная ошибка формата', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ oops: true }));

        await expect(createAdapter().listPages()).rejects.toThrow('expected an array');
    });
});

describe('HttpStorageAdapter: 404 → null/false по контракту IStorageAdapter', () => {
    it.each([
        ['getPage', (a: ReturnType<typeof createAdapter>) => a.getPage(1), null],
        [
            'getPageByPagename',
            (a: ReturnType<typeof createAdapter>) => a.getPageByPagename('x'),
            null,
        ],
        [
            'updatePage',
            (a: ReturnType<typeof createAdapter>) => a.updatePage(1, { title: 'T' }),
            null,
        ],
        ['deletePage', (a: ReturnType<typeof createAdapter>) => a.deletePage(1), false],
        ['getPageVersion', (a: ReturnType<typeof createAdapter>) => a.getPageVersion(1, 2), null],
        ['updateMedia', (a: ReturnType<typeof createAdapter>) => a.updateMedia(1, {}), null],
        ['deleteMedia', (a: ReturnType<typeof createAdapter>) => a.deleteMedia(1), false],
    ])('%s: HTTP 404 → контрактное значение', async (_name, call, expected) => {
        fetchMock.mockResolvedValue(jsonResponse({ message: 'not found' }, 404));

        await expect(call(createAdapter())).resolves.toBe(expected);
    });

    it('404 не глотается там, где «не найдено» не входит в контракт (listPages)', async () => {
        fetchMock.mockResolvedValue(jsonResponse(null, 404));

        await expect(createAdapter().listPages()).rejects.toThrow('HTTP 404');
    });
});

describe('HttpStorageAdapter: 409 → доменные ошибки только по точным контрактным кодам', () => {
    it('createPage: 409 data.code=PAGENAME_CONFLICT → BricksPagenameConflictError', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { code: 'PAGENAME_CONFLICT' } }, 409));

        await expect(
            createAdapter().createPage({ pagename: 'busy', schema: { components: [] } })
        ).rejects.toBeInstanceOf(BricksPagenameConflictError);
    });

    it('createPage: 409 без машиночитаемого кода → generic error, не доменный конфликт', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ message: 'quota exceeded' }, 409));

        await expect(
            createAdapter().createPage({ pagename: 'busy', schema: { components: [] } })
        ).rejects.toBeInstanceOf(BricksBackendRequestError);
    });

    it('updatePage: 409 data.code=PAGENAME_CONFLICT при rename → BricksPagenameConflictError', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { code: 'PAGENAME_CONFLICT' } }, 409));

        await expect(createAdapter().updatePage(1, { pagename: 'busy' })).rejects.toBeInstanceOf(
            BricksPagenameConflictError
        );
    });

    it('updatePage: 409 data.code=REVISION_CONFLICT → BricksRevisionConflictError', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: { code: 'REVISION_CONFLICT' } }, 409));

        await expect(
            createAdapter().updatePage(1, { title: 'T', expectedRevision: 2 })
        ).rejects.toBeInstanceOf(BricksRevisionConflictError);
    });

    it('updatePage: 409 без кода или с незнакомым кодом → generic error', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(null, 409))
            .mockResolvedValueOnce(jsonResponse({ data: { code: 'QUOTA_EXCEEDED' } }, 409));

        await expect(createAdapter().updatePage(1, { title: 'T' })).rejects.toBeInstanceOf(
            BricksBackendRequestError
        );
        await expect(createAdapter().updatePage(1, { title: 'T' })).rejects.toBeInstanceOf(
            BricksBackendRequestError
        );
    });

    it('лояльный парсер кода: top-level `code` без envelope data тоже распознаётся', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ code: 'PAGENAME_CONFLICT' }, 409));

        await expect(createAdapter().updatePage(1, { pagename: 'busy' })).rejects.toBeInstanceOf(
            BricksPagenameConflictError
        );
    });
});

describe('HttpStorageAdapter: идемпотентный createMedia', () => {
    const payload = {
        url: 'https://s3/x.webp',
        filename: 'x.webp',
        size: 10,
        mimeType: 'image/webp',
        category: 'photo',
    };

    it('409 от backend → повторное чтение списка и возврат существующей записи по url', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(null, 409))
            .mockResolvedValueOnce(
                jsonResponse([{ id: 42, url: 'https://s3/x.webp', filename: 'x.webp' }])
            );

        const media = await createAdapter().createMedia(payload);

        expect(media.id).toBe(42);
        expect(fetchCall(1).url).toBe(`${BASE_URL}/media`);
    });

    it('409 без существующей записи по url → исходная ошибка наружу', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(null, 409))
            .mockResolvedValueOnce(jsonResponse([]));

        await expect(createAdapter().createMedia(payload)).rejects.toBeInstanceOf(
            BricksBackendRequestError
        );
    });
});

describe('HttpStorageAdapter: getPageByPagename — синтез editorial-полей public-проекции', () => {
    const externalPublicPage = {
        id: 1,
        pagename: 'landing',
        title: 'T',
        description: null,
        keywords: null,
        background_color: '#fff',
        layout: null,
        social_image: null,
        url_prefix: null,
        subdomain: null,
        schema: { components: [] },
        published: true,
        created_at: '2026-07-12T00:00:00.000Z',
        updated_at: '2026-07-12T00:00:00.000Z',
    };

    it('public projection без thumbnailUrl/revision дополняется синтетическими значениями', async () => {
        fetchMock.mockResolvedValue(jsonResponse(externalPublicPage));

        const page = await createAdapter().getPageByPagename('landing');

        expect(page?.thumbnailUrl).toBeNull();
        expect(page?.revision).toBe(0);
        expect(page?.published).toBe(true);
    });

    it('идемпотентность: toPublicPageProjection поверх синтезированной строки отбрасывает синтетику', async () => {
        fetchMock.mockResolvedValue(jsonResponse(externalPublicPage));

        const page = (await createAdapter().getPageByPagename('landing')) as IBricksPageRow;
        const projection = toPublicPageProjection(page);

        expect(projection).not.toHaveProperty('thumbnailUrl');
        expect(projection).not.toHaveProperty('revision');
        expect(projection).toEqual(toPublicPageProjection({ ...page, ...projection }));
    });
});

describe('BackendHttpClient: транспортные гарантии', () => {
    it('таймаут: зависший запрос отклоняется с контекстом таймаута', async () => {
        fetchMock.mockImplementation(
            (_url: string, init: RequestInit) =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
                })
        );

        const client = createBackendHttpClient({ baseUrl: BASE_URL, timeoutMs: 20 });

        await expect(client.request('GET', '')).rejects.toThrow('timeout 20ms');
    });

    it('upstream-статус не может стать browser-facing: у ошибки нет поля statusCode (контракт toHttpError)', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ message: 'bad token' }, 401));

        const client = createBackendHttpClient({ baseUrl: BASE_URL, token: 'wrong' });
        const error = await client.request('GET', '').catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(BricksBackendRequestError);
        // toHttpError перебрасывает объекты со `statusCode` как готовые H3-ошибки —
        // поле называется upstreamStatus, чтобы 401/5xx upstream завернулись в generic 500
        expect(error).not.toHaveProperty('statusCode');
        expect((error as BricksBackendRequestError).upstreamStatus).toBe(401);
    });

    it('невалидный JSON успешного ответа — понятная ошибка', async () => {
        fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));

        const client = createBackendHttpClient({ baseUrl: BASE_URL });

        await expect(client.request('GET', '')).rejects.toThrow('invalid JSON');
    });

    it('пустой baseUrl — ошибка конфигурации до запроса', async () => {
        const client = createBackendHttpClient({ baseUrl: '' });

        await expect(client.request('GET', '')).rejects.toThrow('backend.url is not configured');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('probeHealth: сконфигурированный health URL используется как есть; не-2xx — reject', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

        const client = createBackendHttpClient({ baseUrl: BASE_URL });

        await expect(client.probeHealth('https://backend.example.com/health')).rejects.toThrow(
            'HTTP 503'
        );
        expect(fetchCall().url).toBe('https://backend.example.com/health');
    });

    it('probeHealth без health URL — GET {base}, 2xx — готов', async () => {
        fetchMock.mockResolvedValue(jsonResponse([]));

        const client = createBackendHttpClient({ baseUrl: BASE_URL });

        await expect(client.probeHealth()).resolves.toBeUndefined();
        expect(fetchCall().url).toBe(BASE_URL);
    });
});
