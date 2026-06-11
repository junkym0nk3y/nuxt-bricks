/**
 * HTTP Basic Auth middleware для защиты builder, preview и модифицирующих API.
 *
 * Защищает:
 * - /builder/** — редактор лендингов
 * - /bricks/*?preview=true — preview режим
 * - /mock-api/s3-* — S3 операции (загрузка/удаление)
 * - /api/bricks/** POST/PUT/DELETE — модификация лендингов и медиа
 *
 * НЕ защищает:
 * - /bricks/* без ?preview=true — опубликованные страницы
 * - /api/bricks/** GET — чтение данных (публичные лендинги)
 *
 * Настройка через ENV:
 * - BASIC_AUTH_USERNAME (дефолт: admin)
 * - BASIC_AUTH_PASSWORD (дефолт: change-me)
 */
import { defineEventHandler, getHeader, setResponseHeader, createError, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';

/** HTTP методы которые модифицируют данные */
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Проверяет, требует ли запрос авторизации.
 */
function requiresAuth(event: H3Event, parsedUrl: URL): boolean {
    const pathname = parsedUrl.pathname;
    const method = event.node.req.method || 'GET';

    // Builder — всегда защищён
    if (pathname.startsWith('/builder')) {
        return true;
    }

    // Preview режим — защищён
    if (pathname.startsWith('/bricks/') && parsedUrl.searchParams.get('preview') === 'true') {
        return true;
    }

    // S3 операции — всегда защищены
    if (pathname.startsWith('/mock-api/s3-')) {
        return true;
    }

    // Bricks API — защищаем только модифицирующие методы
    if (pathname.startsWith('/api/bricks') && MUTATION_METHODS.includes(method)) {
        return true;
    }

    return false;
}

export default defineEventHandler((event: H3Event) => {
    const url = event.node.req.url || '';
    const parsedUrl = new URL(url, 'http://localhost');

    if (!requiresAuth(event, parsedUrl)) {
        return; // Пропускаем незащищённые пути
    }

    const config = useRuntimeConfig();
    const username = config.basicAuthUsername || 'admin';
    const password = config.basicAuthPassword || 'change-me';

    const authHeader = getHeader(event, 'authorization');

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return sendUnauthorized(event);
    }

    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [user, pass] = credentials.split(':');

    if (user !== username || pass !== password) {
        return sendUnauthorized(event);
    }
});

/**
 * Отправляет 401 Unauthorized с заголовком WWW-Authenticate.
 */
function sendUnauthorized(event: H3Event): never {
    setResponseHeader(event, 'WWW-Authenticate', 'Basic realm="Builder Access"');
    throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
    });
}
