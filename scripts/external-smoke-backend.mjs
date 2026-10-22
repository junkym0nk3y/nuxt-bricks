/**
 * The fake external backend of scripts/external-smoke.mjs: an in-memory implementation
 * of the contract endpoints of an external data backend
 * (docs/external-backend-contract.md), served under BACKEND_BASE_PATH, plus a journal of
 * every request for the assertions. Split out of the main script the same way
 * integration-lifecycle.mjs is.
 */
import { createServer } from 'node:http';

// A full base prefix carrying a path segment — the contract is "backend.url is the
// whole prefix"
export const BACKEND_BASE_PATH = '/cms';

/**
 * The fake external backend: an http server plus a request journal plus in-memory
 * storage.
 *
 * @returns {{ server: import('node:http').Server, requests: Array<{method: string, path: string, query: URLSearchParams, contentType: string, authorization: string, body: unknown}>, state: { pages: Map<number, Record<string, unknown>>, media: Map<number, Record<string, unknown>>, nextPageId: number, nextMediaId: number } }}
 */
export function createFakeExternalBackend() {
    const requests = [];
    const state = {
        pages: new Map(),
        media: new Map(),
        mediaCategories: new Map(),
        nextPageId: 1,
        nextMediaId: 1,
        nextMediaCategoryId: 1,
    };

    const server = createServer((request, response) => {
        const chunks = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            // The query is recorded apart from the path: the point lookup of media
            // carries its key there, and an assertion over the journal has to tell
            // "asked for one file" from "read the whole list"
            const requested = new URL(request.url ?? '/', 'http://backend.invalid');
            const recorded = {
                method: request.method ?? '',
                path: requested.pathname,
                query: requested.searchParams,
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
 * Routing of the fake backend: the contract endpoints, relative to BACKEND_BASE_PATH.
 *
 * @param {{method: string, path: string, body: unknown}} recorded - The request.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state - The storage.
 * @returns {{status: number, body?: unknown}} The response.
 */
function routeBackendRequest(recorded, state) {
    if (!recorded.path.startsWith(BACKEND_BASE_PATH)) {
        return { status: 404, body: { message: 'outside base path' } };
    }
    const path = recorded.path.slice(BACKEND_BASE_PATH.length) || '/';

    return (
        routePagesRequest(recorded.method, path, recorded.body, state) ??
        routeMediaRequest(recorded.method, path, recorded.query, recorded.body, state) ?? {
            status: 404,
            body: { message: `no route ${recorded.method} ${path}` },
        }
    );
}

/**
 * Assembles a full page row out of a create payload.
 *
 * @param {unknown} body - The parsed JSON body.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state - The storage.
 * @param {string} now - Creation time of the row.
 * @returns {Record<string, unknown> & {id: number}} The page row.
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
        headCode: payload.headCode ?? null,
        bodyEndCode: payload.bodyEndCode ?? null,
        noindex: payload.noindex ?? false,
        // The counter starts at one, the way the schema of the built-in storage does
        // (`revision INTEGER NOT NULL DEFAULT 1`). A zero here is not a smaller number
        // but a state the real system never has: the server refuses a precondition
        // that is not a positive integer, so the very first save of a fresh page came
        // back a 400 instead of reaching the lock
        revision: 1,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * The contract endpoints of pages: GET/POST {base}, GET/PATCH/DELETE {base}/:id and the
 * public lookup. GET {base} doubles as the readiness probe of probeHealth.
 *
 * @param {string} method - HTTP method.
 * @param {string} path - Path relative to base.
 * @param {unknown} body - The parsed JSON body.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state - The storage.
 * @returns {{status: number, body?: unknown} | null} The response, or null when the route
 * is not ours.
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
    // The address arrives as the rest of the path: the last segment is the pagename and
    // everything before it is the urlPrefix. The lookup goes by the PAIR rather than by
    // the name: pages of the same name under different prefixes are different pages, and
    // a lookup by name alone would return an arbitrary one
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
        const { expectedRevision, ...fields } = /** @type {Record<string, unknown>} */ (body);
        // The optimistic lock is the external backend's duty by the contract, and
        // without it here the conflict path of the builder could not be reached from a
        // browser at all: the client would send a stale revision and get a quiet
        // overwrite. The precondition is checked only when it is sent — operations that
        // do not carry one (the publication toggle) stay allowed
        if (expectedRevision !== undefined && Number(expectedRevision) !== Number(page.revision)) {
            return {
                status: 409,
                body: { code: 'REVISION_CONFLICT', message: 'revision conflict' },
            };
        }
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
 * The categories of the media library: GET/POST {base}/media/categories and
 * DELETE {base}/media/categories/:slug.
 *
 * Apart from the files for a plain reason of size: together the two halves put the
 * routing over the complexity ceiling of the linter.
 *
 * @param {string} method - HTTP method.
 * @param {string} path - Path relative to base.
 * @param {unknown} body - The parsed JSON body.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state - The storage.
 * @returns {{status: number, body?: unknown} | null} The response, or null when the
 * route is not a category one.
 */
function routeMediaCategoryRequest(method, path, body, state) {
    // The categories go before the files: `/media/categories` would otherwise be
    // caught by nothing at all and answer 404, which is exactly what made an upload
    // into a fresh library fail — the handler reads the categories before it writes
    // the file
    if (path === '/media/categories') {
        if (method === 'GET') {
            return { status: 200, body: [...state.mediaCategories.values()] };
        }
        if (method === 'POST') {
            const payload = /** @type {Record<string, unknown>} */ (body);
            const slug = String(payload.slug);
            // Idempotent by slug, as the contract demands: a repeated creation
            // returns the category that is already there instead of a conflict
            const existing = state.mediaCategories.get(slug);
            if (existing) {
                return { status: 200, body: existing };
            }
            // The row carries `id` and `sortOrder` because the contract lists them as
            // mandatory: a double that answers with less lets the adapter pass on data
            // no real backend would send
            const row = {
                id: state.nextMediaCategoryId++,
                slug,
                label: payload.label ?? slug,
                sortOrder: state.mediaCategories.size,
            };
            state.mediaCategories.set(slug, row);
            return { status: 201, body: row };
        }
    }
    const categoryMatch = path.match(/^\/media\/categories\/(.+)$/);
    if (method === 'DELETE' && categoryMatch) {
        const slug = decodeURIComponent(categoryMatch[1]);
        if (!state.mediaCategories.has(slug)) {
            return { status: 404, body: { message: 'not found' } };
        }
        state.mediaCategories.delete(slug);
        // Both halves are atomic by the contract: the category leaves the files
        // together with itself. The answer is `{ clearedCount }` rather than a 204 or
        // a flag — the adapter reads that number and the interface shows it, "the
        // category is gone" and "twelve files lost their category" being two events
        let clearedCount = 0;
        for (const row of state.media.values()) {
            if (row.category === slug) {
                row.category = null;
                clearedCount += 1;
            }
        }
        return { status: 200, body: { clearedCount } };
    }
    return null;
}

/**
 * Registration of media metadata (`POST {base}/media`).
 *
 * Apart from the routing for the same reason the categories are: together they put
 * `routeMediaRequest` over the complexity ceiling of the linter.
 *
 * @param {unknown} body - The parsed JSON body.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state - The storage.
 * @returns {{status: number, body?: unknown}} The response.
 */
function registerMediaRow(body, state) {
    const payload = /** @type {Record<string, unknown>} */ (body);
    // Idempotency by url comes BEFORE the category check, the order the contract
    // spells out: the category of the first attempt may have been deleted since,
    // and answering a retry with UNKNOWN_MEDIA_CATEGORY instead of the row that
    // already exists is exactly what a retry must not get. The counter is not
    // touched on this path either — a bumped id would leave unexplained gaps
    const existing = [...state.media.values()].find((row) => row.url === payload.url);
    if (existing) {
        return { status: 200, body: existing };
    }
    // An unknown category is refused by the exact contract code: without this the
    // double accepts any string, and the branch of the app that turns that refusal
    // into a message is reached by no test at all
    if (payload.category && !state.mediaCategories.has(String(payload.category))) {
        return {
            status: 400,
            body: { code: 'UNKNOWN_MEDIA_CATEGORY', message: 'unknown media category' },
        };
    }
    // Every field of the contract row is stored, the nullable ones included: the
    // adapter reads a missing key as null and silently switches progressive loading
    // off, so a double that drops the dimensions and the variants hides the very
    // thing the gate is there to see. `alt` and `uploadedAt` come from the payload
    // — the bucket import passes the date of the object, and a generated one would
    // date an imported file from the import
    const row = {
        id: state.nextMediaId++,
        url: payload.url,
        filename: payload.filename,
        alt: payload.alt ?? '',
        size: payload.size,
        uploadedAt: payload.uploadedAt ?? new Date().toISOString(),
        mimeType: payload.mimeType,
        category: payload.category ?? null,
        svgContent: payload.svgContent ?? null,
        width: payload.width ?? null,
        height: payload.height ?? null,
        previewUrl: payload.previewUrl ?? null,
        mockUrl: payload.mockUrl ?? null,
    };
    state.media.set(row.id, row);

    return { status: 201, body: row };
}

/**
 * The contract endpoints of media metadata: GET/POST {base}/media, the point lookup
 * GET {base}/media/by-url, DELETE {base}/media/:id, and the categories of the
 * library — GET/POST {base}/media/categories, DELETE {base}/media/categories/:slug.
 *
 * @param {string} method - HTTP method.
 * @param {string} path - Path relative to base.
 * @param {URLSearchParams} query - The query of the request.
 * @param {unknown} body - The parsed JSON body.
 * @param {ReturnType<typeof createFakeExternalBackend>['state']} state - The storage.
 * @returns {{status: number, body?: unknown} | null} The response, or null when the route
 * is not ours.
 */
function routeMediaRequest(method, path, query, body, state) {
    const categoryResponse = routeMediaCategoryRequest(method, path, body, state);
    if (categoryResponse) {
        return categoryResponse;
    }
    // The point lookup goes before the list: an absence answers `{ item: null }` and
    // not a 404, so that a consumer can tell "no such file" from an endpoint that is
    // not implemented
    if (method === 'GET' && path === '/media/by-url') {
        const url = query.get('url');
        if (!url) {
            return { status: 400, body: { message: 'url is required' } };
        }
        const found = [...state.media.values()].find((row) => row.url === url);
        return { status: 200, body: { item: found ?? null } };
    }
    if (method === 'GET' && path === '/media') {
        return { status: 200, body: [...state.media.values()] };
    }
    if (method === 'POST' && path === '/media') {
        return registerMediaRow(body, state);
    }
    const mediaMatch = path.match(/^\/media\/(\d+)$/);
    if (method === 'DELETE' && mediaMatch) {
        const deleted = state.media.delete(Number(mediaMatch[1]));
        return deleted ? { status: 204 } : { status: 404, body: {} };
    }
    return null;
}
