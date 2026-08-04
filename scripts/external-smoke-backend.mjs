/**
 * Fake external backend для scripts/external-smoke.mjs: in-memory реализация
 * контрактных ручек external data backend (docs/external-backend-contract.md)
 * относительно BACKEND_BASE_PATH + журнал всех запросов для ассертов.
 * Вынесен из основного скрипта по паттерну integration-lifecycle.mjs.
 */
import { createServer } from 'node:http';

// Полный base-префикс с сегментом пути — контракт «backend.url = полный префикс»
export const BACKEND_BASE_PATH = '/cms';

/**
 * Fake external backend: http-сервер + журнал запросов + in-memory хранилище.
 *
 * @returns {{ server: import('node:http').Server, requests: Array<{method: string, path: string, contentType: string, authorization: string, body: unknown}>, state: { pages: Map<number, Record<string, unknown>>, media: Map<number, Record<string, unknown>>, nextPageId: number, nextMediaId: number } }}
 */
export function createFakeExternalBackend() {
    const requests = [];
    const state = { pages: new Map(), media: new Map(), nextPageId: 1, nextMediaId: 1 };

    const server = createServer((request, response) => {
        const chunks = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            const recorded = {
                method: request.method ?? '',
                path: (request.url ?? '').split('?')[0],
                contentType: String(request.headers['content-type'] ?? ''),
                authorization: String(request.headers.authorization ?? ''),
                body: rawBody ? JSON.parse(rawBody) : null,
            };
            requests.push(recorded);
            const result = routeBackendRequest(recorded, state);
            response.writeHead(result.status, { 'content-type': 'application/json' });
            response.end(result.body === undefined ? undefined : JSON.stringify(result.body));
        });
    });

    return { server, requests, state };
}

/**
 * Роутинг fake backend: контрактные ручки относительно BACKEND_BASE_PATH.
 *
 * @param {{method: string, path: string, body: unknown}} recorded Запрос.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state Хранилище.
 * @returns {{status: number, body?: unknown}} Ответ.
 */
function routeBackendRequest(recorded, state) {
    if (!recorded.path.startsWith(BACKEND_BASE_PATH)) {
        return { status: 404, body: { message: 'outside base path' } };
    }
    const path = recorded.path.slice(BACKEND_BASE_PATH.length) || '/';

    return (
        routePagesRequest(recorded.method, path, recorded.body, state) ??
        routeMediaRequest(recorded.method, path, recorded.body, state) ?? {
            status: 404,
            body: { message: `no route ${recorded.method} ${path}` },
        }
    );
}

/**
 * Собирает полную строку страницы из create payload.
 *
 * @param {unknown} body Распарсенное JSON-тело.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state Хранилище.
 * @param {string} now Время создания строки.
 * @returns {Record<string, unknown> & {id: number}} Строка страницы.
 */
function createPageRow(body, state, now) {
    const payload = /** @type {Record<string, unknown>} */ (body);

    return {
        id: state.nextPageId++,
        pagename: payload.pagename,
        title: payload.title ?? null,
        description: payload.description ?? null,
        keywords: payload.keywords ?? null,
        backgroundColor: payload.backgroundColor ?? null,
        layout: payload.layout ?? null,
        socialImage: payload.socialImage ?? null,
        urlPrefix: payload.urlPrefix ?? null,
        subdomain: payload.subdomain ?? null,
        thumbnailUrl: null,
        schema: payload.schema,
        published: payload.published ?? false,
        revision: 0,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Контрактные ручки страниц: GET/POST {base}, GET/PATCH/DELETE {base}/:id,
 * public lookup. GET {base} — одновременно readiness-проба probeHealth.
 *
 * @param {string} method HTTP-метод.
 * @param {string} path Путь относительно base.
 * @param {unknown} body Распарсенное JSON-тело.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state Хранилище.
 * @returns {{status: number, body?: unknown} | null} Ответ или null (не наш маршрут).
 */
function routePagesRequest(method, path, body, state) {
    const now = new Date().toISOString();

    if (method === 'GET' && path === '/') {
        const summaries = [...state.pages.values()].map(
            ({ schema: _schema, ...summary }) => summary
        );
        return { status: 200, body: summaries };
    }
    if (method === 'POST' && path === '/') {
        const row = createPageRow(body, state, now);
        state.pages.set(row.id, row);
        return { status: 201, body: row };
    }
    // Адрес приходит остатком пути: последний сегмент — pagename, всё до него —
    // urlPrefix. Ищем по ПАРЕ, а не по имени: одноимённые страницы под разными
    // префиксами — разные страницы, и lookup по имени вернул бы произвольную
    const publicMatch = path.match(/^\/public\/pages\/(.+)$/);
    if (method === 'GET' && publicMatch) {
        const segments = publicMatch[1].split('/').filter(Boolean).map(decodeURIComponent);
        const pagename = segments.pop();
        const urlPrefix = segments.length > 0 ? segments.join('/') : null;
        const page = [...state.pages.values()].find(
            (row) =>
                row.pagename === pagename &&
                (row.urlPrefix ?? row.url_prefix ?? null) === urlPrefix &&
                row.published
        );
        if (!page) {
            return { status: 404, body: { message: 'not found' } };
        }
        const { thumbnailUrl: _t, revision: _r, ...projection } = page;
        return { status: 200, body: projection };
    }
    const pageMatch = path.match(/^\/(\d+)$/);
    if (!pageMatch) {
        return null;
    }
    const page = state.pages.get(Number(pageMatch[1]));
    if (!page) {
        return { status: 404, body: { message: 'not found' } };
    }
    if (method === 'GET') {
        return { status: 200, body: page };
    }
    if (method === 'PATCH') {
        const { expectedRevision: _p, ...fields } = /** @type {Record<string, unknown>} */ (body);
        Object.assign(page, fields, { revision: Number(page.revision) + 1, updatedAt: now });
        return { status: 200, body: page };
    }
    if (method === 'DELETE') {
        state.pages.delete(Number(pageMatch[1]));
        return { status: 204 };
    }
    return null;
}

/**
 * Контрактные ручки media metadata: GET/POST {base}/media, DELETE {base}/media/:id.
 *
 * @param {string} method HTTP-метод.
 * @param {string} path Путь относительно base.
 * @param {unknown} body Распарсенное JSON-тело.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state Хранилище.
 * @returns {{status: number, body?: unknown} | null} Ответ или null (не наш маршрут).
 */
function routeMediaRequest(method, path, body, state) {
    if (method === 'GET' && path === '/media') {
        return { status: 200, body: [...state.media.values()] };
    }
    if (method === 'POST' && path === '/media') {
        const payload = /** @type {Record<string, unknown>} */ (body);
        const row = {
            id: state.nextMediaId++,
            url: payload.url,
            filename: payload.filename,
            alt: '',
            size: payload.size,
            uploadedAt: new Date().toISOString(),
            mimeType: payload.mimeType,
            category: payload.category,
            svgContent: payload.svgContent ?? null,
        };
        state.media.set(row.id, row);
        return { status: 201, body: row };
    }
    const mediaMatch = path.match(/^\/media\/(\d+)$/);
    if (method === 'DELETE' && mediaMatch) {
        const deleted = state.media.delete(Number(mediaMatch[1]));
        return deleted ? { status: 204 } : { status: 404, body: {} };
    }
    return null;
}
