/**
 * The black-box HTTP lifecycle of the integration smoke: the checks that run against a
 * started production server of the consumer. The orchestration (pack, migrate, build,
 * boot) lives in scripts/integration-smoke.mjs.
 */
import { Buffer } from 'node:buffer';
import { assertOk } from './smoke-shared.mjs';

/** A 1x1 png for the media upload. */
const PNG_1X1_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
/**
 * The label of the category of the media stage. The category is created by the stage
 * itself: the schema has no preset categories, and an upload with an unknown slug
 * rightfully answers 400 — the former hardcoded `other` was green only where a category
 * with that slug had been left in the database by manual runs.
 */
const MEDIA_CATEGORY_LABEL = 'IT Smoke';

/**
 * Headers of the authorized requests: the CSRF header plus the cookie.
 *
 * @param {string} [cookie] - The session cookie.
 * @returns {Record<string, string>} The headers.
 */
function jsonHeaders(cookie) {
    return {
        'content-type': 'application/json',
        'x-bricks-csrf': '1',
        ...(cookie ? { cookie } : {}),
    };
}

/**
 * Creates the API client of the smoke run: a fetch with an optional status check and
 * JSON parsing of the response.
 *
 * @param {string} origin - Origin of the started server.
 * @returns {(path: string, options?: { method?: string, cookie?: string, body?: unknown, expectStatus?: number }) => Promise<{ response: Response, data: any }>}
 * The request function.
 */
function createApiClient(origin) {
    return async function api(path, { method = 'GET', cookie, body, expectStatus } = {}) {
        const response = await fetch(`${origin}${path}`, {
            method,
            headers: jsonHeaders(cookie),
            body: body === undefined ? undefined : JSON.stringify(body),
            redirect: 'manual',
        });

        if (expectStatus !== undefined) {
            assertOk(
                response.status === expectStatus,
                `${method} ${path}: expected ${expectStatus}, got ${response.status}`
            );
        }

        const text = await response.text();
        let data = null;

        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            // a non-JSON response is acceptable for errors
        }

        return { response, data };
    };
}

/**
 * Deletes the page of the lifecycle run when it is left over from a previous one, which
 * is what makes local repeats against a single database idempotent.
 *
 * @param {ReturnType<typeof createApiClient>} api - The API client.
 * @param {string} pagename - Name of the page of the run.
 * @param {string} cookie - The session cookie.
 * @returns {Promise<void>} Resolves once the cleanup is done.
 */
async function cleanupStalePage(api, pagename, cookie) {
    const list = await api('/api/bricks', { cookie, expectStatus: 200 });
    assertOk(Array.isArray(list.data), 'GET /api/bricks returned no array of summaries');
    const stale = list.data.find((page) => page?.pagename === pagename);

    if (stale?.id) {
        await api(`/api/bricks/${stale.id}`, { method: 'DELETE', cookie, expectStatus: 200 });
        console.info('[integration-smoke] Removed the page of a previous run');
    }
}

/**
 * The media stage (S3): a category → a multipart upload → a record with an id → deleting
 * the file and the category.
 *
 * The category is created right here instead of being taken ready-made: the slug is
 * computed by the server, and a repeated POST with the same label returns the existing
 * record — which makes the stage idempotent against a single database.
 *
 * @param {string} origin - Origin of the started server.
 * @param {ReturnType<typeof createApiClient>} api - The API client.
 * @param {string} cookie - The session cookie.
 * @returns {Promise<void>} Resolves when the stage is green.
 */
async function runMediaStage(origin, api, cookie) {
    const category = await api('/api/bricks/media/categories', {
        method: 'POST',
        cookie,
        body: { label: MEDIA_CATEGORY_LABEL },
    });
    assertOk(
        [200, 201].includes(category.response.status),
        `creating the category: ${category.response.status}`
    );
    const slug = category.data?.slug;
    assertOk(typeof slug === 'string' && slug.length > 0, 'the category POST returned no slug');

    const form = new FormData();
    form.append(
        'file',
        new File([Buffer.from(PNG_1X1_BASE64, 'base64')], 'it.png', { type: 'image/png' })
    );
    form.append('category', slug);
    const upload = await fetch(`${origin}/api/bricks/media/upload`, {
        method: 'POST',
        headers: { 'x-bricks-csrf': '1', cookie },
        body: form,
    });
    assertOk([200, 201].includes(upload.status), `media upload: ${upload.status}`);
    const media = await upload.json();
    assertOk(Boolean(media?.id), 'the upload returned no media id');
    assertOk(typeof media?.url === 'string' && media.url.length > 0, 'the upload returned no url');
    assertOk(media?.category === slug, `the upload did not keep the category: ${media?.category}`);

    // The file goes before the category: deleting a category takes it off its own files,
    // so the reverse order would already be checking a different relation
    await api(`/api/bricks/media/${media.id}`, { method: 'DELETE', cookie, expectStatus: 200 });
    await api(`/api/bricks/media/categories/${slug}`, {
        method: 'DELETE',
        cookie,
        expectStatus: 200,
    });
    console.info('[integration-smoke] Media upload and delete through S3 passed');
}

/**
 * The schema contract stage: invalid components and a cyclic graph both answer 400.
 *
 * @param {ReturnType<typeof createApiClient>} api - The API client.
 * @param {number} pageId - Id of the page.
 * @param {string} cookie - The session cookie.
 * @returns {Promise<void>} Resolves when the stage is green.
 */
async function runSchemaContractStage(api, pageId, cookie) {
    await api(`/api/bricks/${pageId}`, {
        method: 'PUT',
        cookie,
        body: { schema: { components: [null] } },
        expectStatus: 400,
    });
    await api(`/api/bricks/${pageId}`, {
        method: 'PUT',
        cookie,
        body: {
            schema: {
                components: [
                    {
                        id: 'cycle-a',
                        componentName: 'BlockGrid',
                        brickPath: 'layouts/BlockGrid',
                        parent: 'cycle-b',
                        children: ['cycle-b'],
                    },
                    {
                        id: 'cycle-b',
                        componentName: 'BlockGrid',
                        brickPath: 'layouts/BlockGrid',
                        parent: 'cycle-a',
                        children: ['cycle-a'],
                    },
                ],
            },
        },
        expectStatus: 400,
    });
}

/**
 * The black-box HTTP lifecycle against a started consumer: the CSRF gate → login → CRUD
 * of a page → the schema contract → optimistic locking → publish → the public read model
 * → versions plus restore → media (S3) → logout.
 *
 * @param {{ origin: string, username: string, password: string, pagename: string, hasS3: boolean }} options
 * - Parameters of the run.
 * @returns {Promise<void>} Resolves when the lifecycle is green.
 */
export async function runLifecycle({ origin, username, password, pagename, hasS3 }) {
    const api = createApiClient(origin);

    // Health and readiness with a live database
    await api('/api/bricks/health', { expectStatus: 200 });
    await api('/api/bricks/health/ready', { expectStatus: 200 });

    // The CSRF gate: an unsafe request without the header, Origin or Sec-Fetch-Site — 403
    const bareLogin = await fetch(`${origin}/api/bricks/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    assertOk(
        bareLogin.status === 403,
        `login without the CSRF marks: expected 403, got ${bareLogin.status}`
    );

    // Login gives the session cookie
    const login = await api('/api/bricks/auth/login', {
        method: 'POST',
        body: { username, password },
        expectStatus: 200,
    });
    assertOk(login.data?.user?.username === username, 'login returned no user');
    const setCookie = login.response.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    assertOk(cookie.startsWith('bricks-session='), 'login returned no session cookie');

    // An unauthorized editorial GET answers 401; an authorized listing answers 200
    await api('/api/bricks', { expectStatus: 401 });
    await cleanupStalePage(api, pagename, cookie);

    // Creating a draft (without an explicit published, createPage defaults to true)
    const created = await api('/api/bricks', {
        method: 'POST',
        cookie,
        body: { pagename, title: 'IT', schema: { components: [] }, published: false },
    });
    assertOk([200, 201].includes(created.response.status), `create: ${created.response.status}`);
    const pageId = created.data?.id;
    assertOk(Boolean(pageId), 'create returned no page id');
    assertOk(Number.isInteger(created.data?.revision), 'create returned no revision');

    // A draft is not served by the public read model
    await api(`/api/bricks/public/pages/${pagename}`, { expectStatus: 404 });

    // The schema contract
    await runSchemaContractStage(api, pageId, cookie);

    // An update carrying a schema takes a version snapshot and increments the revision
    const validSchema = {
        components: [
            {
                id: 'it-component-1',
                componentName: 'BlockText',
                brickPath: 'text/BlockText',
                props: {},
                parent: null,
                children: [],
            },
        ],
    };
    const updated = await api(`/api/bricks/${pageId}`, {
        method: 'PUT',
        cookie,
        body: { schema: validSchema, expectedRevision: created.data.revision },
        expectStatus: 200,
    });
    const freshRevision = updated.data?.revision;
    assertOk(
        Number.isInteger(freshRevision) && freshRevision > created.data.revision,
        'update did not increment the revision'
    );

    // Optimistic locking (write races): a stale expectedRevision answers 409
    const conflict = await api(`/api/bricks/${pageId}`, {
        method: 'PUT',
        cookie,
        body: { schema: validSchema, expectedRevision: created.data.revision },
        expectStatus: 409,
    });
    assertOk(
        conflict.data?.data?.code === 'REVISION_CONFLICT',
        `a 409 without the REVISION_CONFLICT code: ${JSON.stringify(conflict.data)}`
    );

    // Publish, then the public read model without the editor fields
    // (a PATCH of published counts as content: the revision is incremented here too)
    const publishPatch = await api(`/api/bricks/${pageId}`, {
        method: 'PATCH',
        cookie,
        body: { published: true },
        expectStatus: 200,
    });
    const publishedRevision = publishPatch.data?.revision;
    assertOk(Number.isInteger(publishedRevision), 'the publish PATCH returned no revision');
    const publicPage = await api(`/api/bricks/public/pages/${pagename}`, { expectStatus: 200 });
    assertOk(publicPage.data?.pagename === pagename, 'the public projection returned no page');
    assertOk(
        publicPage.data?.revision === undefined,
        'the public projection must not serve the revision'
    );

    // Versions: the snapshot appeared after the update carrying a schema; restore runs
    // with a precondition
    const versions = await api(`/api/bricks/${pageId}/versions`, { cookie, expectStatus: 200 });
    assertOk(
        Array.isArray(versions.data) && versions.data.length >= 1,
        'no version snapshots after an update carrying a schema'
    );
    const restored = await api(`/api/bricks/${pageId}/versions/${versions.data[0].id}/restore`, {
        method: 'POST',
        cookie,
        body: { expectedRevision: publishedRevision },
        expectStatus: 200,
    });
    assertOk(
        Number.isInteger(restored.data?.revision) && restored.data.revision > publishedRevision,
        'restore returned no page with a new revision'
    );

    // Media (S3): the full cycle against MinIO
    if (hasS3) {
        await runMediaStage(origin, api, cookie);
    } else {
        console.warn('[integration-smoke] BRICKS_IT_S3_* are unset — the media stage is skipped');
    }

    // Cleanup and logout: a dead session answers 401 again
    await api(`/api/bricks/${pageId}`, { method: 'DELETE', cookie, expectStatus: 200 });
    await api('/api/bricks/auth/logout', { method: 'POST', cookie, expectStatus: 200 });
    await api('/api/bricks', { cookie, expectStatus: 401 });

    console.info('[integration-smoke] The HTTP lifecycle is green');
}
