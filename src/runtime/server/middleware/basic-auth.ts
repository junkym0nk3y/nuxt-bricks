/**
 * HTTP Basic Auth middleware для защиты builder, preview и модифицирующих API.
 *
 * Защищает:
 * - /bricks/** — менеджер страниц и редактор лендингов
 * - /preview/** — preview режим рендера
 * - /mock-api/s3-* — S3 операции (загрузка/удаление)
 * - /api/bricks/** POST/PUT/DELETE — модификация лендингов и медиа
 *
 * НЕ защищает:
 * - динамические ЧПУ маршруты опубликованных страниц
 * - /api/bricks/** GET — чтение данных (публичные лендинги)
 *
 * Настройка через ENV:
 * - BASIC_AUTH_USERNAME (дефолт: admin)
 * - BASIC_AUTH_PASSWORD (дефолт: change-me — только для dev; в production
 *   с дефолтным паролем защищённые пути отвечают 503)
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { defineEventHandler, getHeader, setResponseHeader, createError, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';

/** HTTP методы которые модифицируют данные */
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Дефолтный пароль из module.ts — в production с ним защищённые пути недоступны */
const DEFAULT_PASSWORD = 'change-me';

/**
 * Сравнивает строки за константное время (защита от timing-атак).
 * Сравниваются SHA-256 дайджесты — выравнивает длину входов для timingSafeEqual.
 */
function safeCompare(a: string, b: string): boolean {
    const hashA = createHash('sha256').update(a).digest();
    const hashB = createHash('sha256').update(b).digest();
    return timingSafeEqual(hashA, hashB);
}

/**
 * Проверяет, требует ли запрос авторизации.
 */
function requiresAuth(event: H3Event, parsedUrl: URL): boolean {
    const pathname = parsedUrl.pathname;
    const method = event.node.req.method || 'GET';

    // Менеджер страниц (/bricks) и редактор (/bricks/*) — всегда защищены
    if (pathname === '/bricks' || pathname.startsWith('/bricks/')) {
        return true;
    }

    // Preview режим (/preview/*) — защищён
    if (pathname.startsWith('/preview/')) {
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
    const password = config.basicAuthPassword || DEFAULT_PASSWORD;

    // В production дефолтный пароль равнозначен отсутствию защиты — отказываем явно
    if (process.env.NODE_ENV === 'production' && password === DEFAULT_PASSWORD) {
        console.error(
            '[nuxt-bricks] BASIC_AUTH_PASSWORD не задан (или равен дефолтному "change-me") — доступ к защищённым путям в production заблокирован.'
        );
        throw createError({
            statusCode: 503,
            statusMessage: 'Basic Auth is not configured',
        });
    }

    const authHeader = getHeader(event, 'authorization');

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return sendUnauthorized(event);
    }

    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const separatorIndex = credentials.indexOf(':');
    const user = separatorIndex === -1 ? credentials : credentials.slice(0, separatorIndex);
    const pass = separatorIndex === -1 ? '' : credentials.slice(separatorIndex + 1);

    // Обе проверки выполняются всегда — без short-circuit по логину
    const userValid = safeCompare(user, username);
    const passValid = safeCompare(pass, password);

    if (!userValid || !passValid) {
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
