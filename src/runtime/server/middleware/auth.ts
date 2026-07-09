/**
 * Auth middleware для защиты builder, preview и модифицирующих API.
 * Режим — `bricks.auth.mode` ('basic' | 'database', env BRICKS_AUTH_MODE).
 *
 * Защищает:
 * - /bricks/** — менеджер страниц и редактор лендингов
 * - /preview/** — preview режим рендера
 * - /mock-api/s3-* — S3 операции (загрузка/удаление)
 * - /api/bricks/** POST/PUT/PATCH/DELETE — модификация лендингов и медиа
 *
 * НЕ защищает:
 * - динамические ЧПУ маршруты опубликованных страниц
 * - /api/bricks/** GET — чтение данных (публичные лендинги)
 * - в database-режиме: /bricks/login и /api/bricks/auth/** (иначе не войти)
 *
 * Basic-режим — HTTP Basic Auth, настройка через ENV:
 * - BASIC_AUTH_USERNAME (дефолт: admin)
 * - BASIC_AUTH_PASSWORD (дефолт: change-me — только для dev; в production
 *   с дефолтным паролем защищённые пути отвечают 503)
 *
 * Database-режим — cookie-сессии в Postgres: невалидная сессия на HTML-пути
 * редиректит на /bricks/login, на API — 401 без WWW-Authenticate.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
    defineEventHandler,
    getHeader,
    setResponseHeader,
    sendRedirect,
    createError,
    type H3Event,
} from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { requiresAuth, isProtectedHtmlPath } from '../utils/auth/routeProtection';
import { resolveSessionUser } from '../utils/auth/session';
import {
    clearSessionCookie,
    getSessionTokenFromCookie,
    hashSessionToken,
    resolveSessionMaxAgeSeconds,
    setSessionCookie,
} from '../utils/auth/sessionCookie';
import { useBricksAuthAdapter } from '../../modules/persistence/server/registry';
import type { TBricksAuthMode } from '../utils/auth/types';

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
 * Отправляет 401 Unauthorized с заголовком WWW-Authenticate (basic-режим).
 */
function sendUnauthorized(event: H3Event): never {
    setResponseHeader(event, 'WWW-Authenticate', 'Basic realm="Builder Access"');
    throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
    });
}

/**
 * HTTP Basic Auth — прежняя логика basic-auth.ts.
 */
function handleBasicAuth(event: H3Event): void {
    const config = useRuntimeConfig();
    const username = (config.basicAuthUsername as string | undefined) || 'admin';
    const password = (config.basicAuthPassword as string | undefined) || DEFAULT_PASSWORD;

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
}

/**
 * Отказывает неавторизованному запросу в database-режиме:
 * HTML-путь → 302 на /bricks/login с возвратным redirect, API → 401 без
 * WWW-Authenticate (чтобы браузер не показывал нативный Basic-диалог).
 */
function rejectDatabaseAuth(event: H3Event, parsedUrl: URL): Promise<void> | never {
    clearSessionCookie(event);

    if (isProtectedHtmlPath(parsedUrl.pathname)) {
        const redirect = encodeURIComponent(parsedUrl.pathname + parsedUrl.search);
        return sendRedirect(event, `/bricks/login?redirect=${redirect}`, 302);
    }

    throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
    });
}

/**
 * Sliding-продление сессии: если осталось меньше половины срока —
 * продлевает запись в БД и переустанавливает cookie.
 */
async function extendSessionIfNeeded(event: H3Event, expiresAt: string): Promise<void> {
    const maxAgeSeconds = resolveSessionMaxAgeSeconds();
    const remainingMs = new Date(expiresAt).getTime() - Date.now();

    if (remainingMs >= (maxAgeSeconds * 1000) / 2) {
        return;
    }

    const token = getSessionTokenFromCookie(event);

    if (!token) {
        return;
    }

    const nextExpiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

    try {
        await useBricksAuthAdapter().touchSession(hashSessionToken(token), nextExpiresAt);
        setSessionCookie(event, token, maxAgeSeconds);
    } catch (error: unknown) {
        // Неудачное продление не должно валить авторизованный запрос
        console.error('[nuxt-bricks] Failed to extend session:', error);
    }
}

/**
 * Database-auth: cookie-сессия в Postgres + sliding-продление.
 */
async function handleDatabaseAuth(event: H3Event, parsedUrl: URL): Promise<void> {
    const config = useRuntimeConfig();

    if (!config.bricksDatabaseUrl) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Database auth is not configured',
        });
    }

    let session;

    try {
        session = await resolveSessionUser(event);
    } catch (error: unknown) {
        // Недоступная БД — инфраструктурная проблема, не 401 и не 500
        console.error('[nuxt-bricks] Auth storage error:', error);
        throw createError({
            statusCode: 503,
            statusMessage: 'Auth storage is unavailable',
        });
    }

    if (!session) {
        return rejectDatabaseAuth(event, parsedUrl);
    }

    event.context.bricksUser = session.user;
    await extendSessionIfNeeded(event, session.expiresAt);
}

export default defineEventHandler(async (event: H3Event) => {
    const url = event.node.req.url || '';
    const parsedUrl = new URL(url, 'http://localhost');
    const method = event.node.req.method || 'GET';

    const config = useRuntimeConfig();
    const mode = (config.bricksAuthMode as TBricksAuthMode | undefined) ?? 'basic';

    if (!requiresAuth(parsedUrl.pathname, method, mode)) {
        return; // Пропускаем незащищённые пути
    }

    if (mode === 'database') {
        return handleDatabaseAuth(event, parsedUrl);
    }

    return handleBasicAuth(event);
});
