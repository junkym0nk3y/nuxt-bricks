/**
 * Black-box HTTP lifecycle integration smoke: проверки против
 * запущенного production-сервера consumer'а. Оркестрация (pack, migrate,
 * build, boot) — scripts/integration-smoke.mjs.
 */
import { Buffer } from 'node:buffer';
import { assertOk } from './smoke-shared.mjs';

/** 1x1 png для media upload. */
const PNG_1X1_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Заголовки авторизованных запросов: CSRF-заголовок + cookie.
 *
 * @param {string} [cookie] Cookie сессии.
 * @returns {Record<string, string>} Заголовки.
 */
function jsonHeaders(cookie) {
    return {
        'content-type': 'application/json',
        'x-bricks-csrf': '1',
        ...(cookie ? { cookie } : {}),
    };
}

/**
 * Создаёт API-клиент smoke-прогона: fetch с опциональной проверкой статуса
 * и JSON-разбором ответа.
 *
 * @param {string} origin Origin запущенного сервера.
 * @returns {(path: string, options?: { method?: string, cookie?: string, body?: unknown, expectStatus?: number }) => Promise<{ response: Response, data: any }>}
 * Функция запроса.
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
                `${method} ${path}: ожидали ${expectStatus}, получили ${response.status}`
            );
        }

        const text = await response.text();
        let data = null;

        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            // не-JSON ответ допустим для ошибок
        }

        return { response, data };
    };
}

/**
 * Удаляет страницу lifecycle-прогона, если она осталась от прошлого запуска
 * (идемпотентность локальных повторов против одной БД).
 *
 * @param {ReturnType<typeof createApiClient>} api API-клиент.
 * @param {string} pagename Имя страницы прогона.
 * @param {string} cookie Cookie сессии.
 * @returns {Promise<void>} Резолвится после зачистки.
 */
async function cleanupStalePage(api, pagename, cookie) {
    const list = await api('/api/bricks', { cookie, expectStatus: 200 });
    assertOk(Array.isArray(list.data), 'GET /api/bricks не вернул массив сводок');
    const stale = list.data.find((page) => page?.pagename === pagename);

    if (stale?.id) {
        await api(`/api/bricks/${stale.id}`, { method: 'DELETE', cookie, expectStatus: 200 });
        console.info('[integration-smoke] Удалена страница прошлого прогона');
    }
}

/**
 * Media-этап (S3): multipart upload → запись с id; delete → { success }.
 *
 * @param {string} origin Origin запущенного сервера.
 * @param {ReturnType<typeof createApiClient>} api API-клиент.
 * @param {string} cookie Cookie сессии.
 * @returns {Promise<void>} Резолвится при зелёном этапе.
 */
async function runMediaStage(origin, api, cookie) {
    const form = new FormData();
    form.append(
        'file',
        new File([Buffer.from(PNG_1X1_BASE64, 'base64')], 'it.png', { type: 'image/png' })
    );
    form.append('category', 'other');
    const upload = await fetch(`${origin}/api/bricks/media/upload`, {
        method: 'POST',
        headers: { 'x-bricks-csrf': '1', cookie },
        body: form,
    });
    assertOk([200, 201].includes(upload.status), `media upload: ${upload.status}`);
    const media = await upload.json();
    assertOk(Boolean(media?.id), 'upload не вернул id медиа');
    assertOk(typeof media?.url === 'string' && media.url.length > 0, 'upload не вернул url');

    await api(`/api/bricks/media/${media.id}`, { method: 'DELETE', cookie, expectStatus: 200 });
    console.info('[integration-smoke] Media upload/delete через S3 прошли');
}

/**
 * Этап контракта схемы: невалидные компоненты и циклический граф — 400.
 *
 * @param {ReturnType<typeof createApiClient>} api API-клиент.
 * @param {number} pageId Id страницы.
 * @param {string} cookie Cookie сессии.
 * @returns {Promise<void>} Резолвится при зелёном этапе.
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
 * Black-box HTTP lifecycle против запущенного consumer'а: CSRF-гейт → login →
 * CRUD страницы → контракт схемы → optimistic locking → publish → public
 * read-model → версии + restore → media (S3) → logout.
 *
 * @param {{ origin: string, username: string, password: string, pagename: string, hasS3: boolean }} options
 * Параметры прогона.
 * @returns {Promise<void>} Резолвится при зелёном lifecycle.
 */
export async function runLifecycle({ origin, username, password, pagename, hasS3 }) {
    const api = createApiClient(origin);

    // Health / readiness с живой БД
    await api('/api/bricks/health', { expectStatus: 200 });
    await api('/api/bricks/health/ready', { expectStatus: 200 });

    // CSRF-гейт: unsafe без заголовка/Origin/Sec-Fetch-Site — 403
    const bareLogin = await fetch(`${origin}/api/bricks/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    assertOk(
        bareLogin.status === 403,
        `login без CSRF-признаков: ожидали 403, получили ${bareLogin.status}`
    );

    // Login → cookie сессии
    const login = await api('/api/bricks/auth/login', {
        method: 'POST',
        body: { username, password },
        expectStatus: 200,
    });
    assertOk(login.data?.user?.username === username, 'login не вернул пользователя');
    const setCookie = login.response.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    assertOk(cookie.startsWith('bricks-session='), 'login не вернул cookie сессии');

    // Неавторизованный editorial GET — 401; авторизованный список — 200
    await api('/api/bricks', { expectStatus: 401 });
    await cleanupStalePage(api, pagename, cookie);

    // Create черновика (без явного published createPage дефолтит true)
    const created = await api('/api/bricks', {
        method: 'POST',
        cookie,
        body: { pagename, title: 'IT', schema: { components: [] }, published: false },
    });
    assertOk([200, 201].includes(created.response.status), `create: ${created.response.status}`);
    const pageId = created.data?.id;
    assertOk(Boolean(pageId), 'create не вернул id страницы');
    assertOk(Number.isInteger(created.data?.revision), 'create не вернул revision');

    // Черновик не отдаётся публичной read-model
    await api(`/api/bricks/public/pages/${pagename}`, { expectStatus: 404 });

    // Контракт схемы
    await runSchemaContractStage(api, pageId, cookie);

    // Update со schema → снапшот версии + инкремент revision
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
        'update не инкрементировал revision'
    );

    // Optimistic locking (гонки записи): устаревший expectedRevision — 409
    const conflict = await api(`/api/bricks/${pageId}`, {
        method: 'PUT',
        cookie,
        body: { schema: validSchema, expectedRevision: created.data.revision },
        expectStatus: 409,
    });
    assertOk(
        conflict.data?.data?.code === 'REVISION_CONFLICT',
        `409 без кода REVISION_CONFLICT: ${JSON.stringify(conflict.data)}`
    );

    // Publish → public read-model без editor-полей
    // (PATCH published — контентный: revision инкрементируется и здесь)
    const publishPatch = await api(`/api/bricks/${pageId}`, {
        method: 'PATCH',
        cookie,
        body: { published: true },
        expectStatus: 200,
    });
    const publishedRevision = publishPatch.data?.revision;
    assertOk(Number.isInteger(publishedRevision), 'publish-PATCH не вернул revision');
    const publicPage = await api(`/api/bricks/public/pages/${pagename}`, { expectStatus: 200 });
    assertOk(publicPage.data?.pagename === pagename, 'public projection не вернула страницу');
    assertOk(
        publicPage.data?.revision === undefined,
        'public projection не должна отдавать revision'
    );

    // Версии: снапшот появился после update со schema; restore с precondition
    const versions = await api(`/api/bricks/${pageId}/versions`, { cookie, expectStatus: 200 });
    assertOk(
        Array.isArray(versions.data) && versions.data.length >= 1,
        'после update со schema нет снапшотов версий'
    );
    const restored = await api(`/api/bricks/${pageId}/versions/${versions.data[0].id}/restore`, {
        method: 'POST',
        cookie,
        body: { expectedRevision: publishedRevision },
        expectStatus: 200,
    });
    assertOk(
        Number.isInteger(restored.data?.revision) && restored.data.revision > publishedRevision,
        'restore не вернул страницу с новой revision'
    );

    // Media (S3): полный цикл против MinIO
    if (hasS3) {
        await runMediaStage(origin, api, cookie);
    } else {
        console.warn('[integration-smoke] BRICKS_IT_S3_* не заданы — media-этап пропущен');
    }

    // Cleanup + logout: мёртвая сессия снова 401
    await api(`/api/bricks/${pageId}`, { method: 'DELETE', cookie, expectStatus: 200 });
    await api('/api/bricks/auth/logout', { method: 'POST', cookie, expectStatus: 200 });
    await api('/api/bricks', { cookie, expectStatus: 401 });

    console.info('[integration-smoke] HTTP lifecycle зелёный');
}
