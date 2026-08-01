/**
 * Auth middleware для защиты builder, preview и модифицирующих API.
 * Режим — `bricks.auth.mode` ('basic' | 'database', env BRICKS_AUTH_MODE).
 *
 * Защищает (префиксы страниц — из `bricks.routes`, дефолты /bricks и /preview;
 * матрица работает с логическим путём — `app.baseURL` стрипается до проверки):
 * - <builderPrefix>/** — менеджер страниц и редактор лендингов
 * - <previewPrefix>/** — preview режим рендера
 * - /api/bricks/** — весь editorial API, включая GET (drafts, полная schema,
 *   медиатека, версии), media proxy и page thumbnail
 *
 * НЕ защищает:
 * - динамические ЧПУ маршруты опубликованных страниц
 * - GET/HEAD /api/bricks/public/** — public read-model для рендера
 * - GET/HEAD /api/bricks/components — библиотека компонентов (публичный
 *   манифест: состав библиотеки и её редакторские метаданные)
 * - в database-режиме: <builderPrefix>/login и /api/bricks/auth/** (иначе не войти)
 *
 * Basic-режим — HTTP Basic Auth, настройка через ENV:
 * - BASIC_AUTH_USERNAME (дефолт: admin)
 * - BASIC_AUTH_PASSWORD (дефолт: change-me — только для dev; в production
 *   с дефолтным паролем защищённые пути отвечают 503)
 * - невалидные креденшелы (заголовок присутствует) делят per-IP rate limit
 *   с database-логином: 30 неудач за 15 минут → 429
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
import { assertCsrfSafe, isCsrfProtectedPath } from '../utils/auth/csrfProtection';
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBuilderLoginPath,
    joinPathBase,
    stripPathBase,
    type IBricksRoutePrefixes,
} from '../../modules/common/utils/bricks/routePaths';
import { resolveSessionUser } from '../utils/auth/session';
import {
    clearSessionCookie,
    getSessionTokenFromCookie,
    hashSessionToken,
    resolveSessionMaxAgeSeconds,
    setSessionCookie,
} from '../utils/auth/sessionCookie';
import { isIpLockedOut, registerIpFailure } from '../utils/auth/loginRateLimiter';
import { resolveRequestClientIp } from '../utils/requestClientIp';
import { useBricksAuthAdapter } from '../../modules/persistence/server/registry';
import { getBricksDefaultStorageFactory } from '../../modules/persistence/server/defaultStorage';
import { rethrowStatementTimeoutError } from '../../modules/persistence/server/utils/handlerHelpers';
import type { IAuthRequestTarget, TBricksAuthMode } from '../utils/auth/types';

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

    // Rate limit невалидных креденшелов: Basic Auth перебирается
    // тем же IP-bucket'ом, что и database-login
    const clientIp = resolveRequestClientIp(event);
    const lockoutSeconds = isIpLockedOut(clientIp);

    if (lockoutSeconds > 0) {
        setResponseHeader(event, 'Retry-After', lockoutSeconds);
        throw createError({ statusCode: 429, statusMessage: 'Too many authentication attempts' });
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
        registerIpFailure(clientIp);
        return sendUnauthorized(event);
    }
}

/**
 * Отказывает неавторизованному запросу в database-режиме:
 * HTML-путь → 302 на страницу логина с возвратным redirect, API → 401 без
 * WWW-Authenticate (чтобы браузер не показывал нативный Basic-диалог).
 * Redirect-параметр — логический путь (без baseURL): после логина он идёт
 * в `navigateTo`, где base подставит роутер; сам Location строится с base.
 */
function rejectDatabaseAuth(event: H3Event, target: IAuthRequestTarget): Promise<void> | never {
    clearSessionCookie(event);

    if (isProtectedHtmlPath(target.logicalPathname, target.prefixes)) {
        const redirect = encodeURIComponent(target.logicalPathname + target.search);
        const loginUrl = `${getBuilderLoginPath(target.prefixes)}?redirect=${redirect}`;
        return sendRedirect(event, joinPathBase(target.baseURL, loginUrl), 302);
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
async function handleDatabaseAuth(event: H3Event, target: IAuthRequestTarget): Promise<void> {
    const config = useRuntimeConfig();

    // Runtime-defense: build-time запрет auth.mode=database + backend.mode=external
    // обходим runtime-env (NUXT_BRICKS_AUTH_MODE + NUXT_BRICKS_DATABASE_URL) —
    // сверяемся с неизменяемым носителем external-режима: build-time фабрика
    // storage-адаптера ставится только Nitro-плагином externalBackendStorage
    if (getBricksDefaultStorageFactory()) {
        console.error(
            '[nuxt-bricks] auth.mode = "database" несовместим с backend.mode = "external" — защищённые пути отвечают 503'
        );
        throw createError({
            statusCode: 503,
            statusMessage: 'Database auth is not available in external backend mode',
        });
    }

    // Runtime-defense: database-auth без БД невозможен. Основная защита —
    // build-ошибка module-backend-config (auth.mode=database + backend.mode=external)
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
        // Остановка серверным лимитом времени — не «хранилище недоступно»:
        // у неё свой статус и машиночитаемый код, по которому билдер выбирает
        // текст. Проверка сессии идёт перед каждым защищённым запросом, поэтому
        // подмена статуса здесь накрыла бы весь editorial API
        rethrowStatementTimeoutError(error);

        // Недоступная БД — инфраструктурная проблема, не 401 и не 500
        console.error('[nuxt-bricks] Auth storage error:', error);
        throw createError({
            statusCode: 503,
            statusMessage: 'Auth storage is unavailable',
        });
    }

    if (!session) {
        return rejectDatabaseAuth(event, target);
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
    const prefixes =
        (config.public?.bricksRoutes as IBricksRoutePrefixes | undefined) ??
        DEFAULT_BRICKS_ROUTE_PREFIXES;
    const baseURL = (config.app?.baseURL as string | undefined) || '/';

    // Матрица работает с логическим путём — фактический pathname содержит baseURL
    const target: IAuthRequestTarget = {
        logicalPathname: stripPathBase(parsedUrl.pathname, baseURL),
        search: parsedUrl.search,
        prefixes,
        baseURL,
    };

    // CSRF-гейт unsafe-методов: ДО auth — login/logout не под
    // requiresAuth, но под CSRF; неавторизованный кросс-сайтовый POST — 403
    if (isCsrfProtectedPath(target.logicalPathname)) {
        assertCsrfSafe(event);
    }

    if (!requiresAuth(target.logicalPathname, method, mode, prefixes)) {
        return; // Пропускаем незащищённые пути
    }

    if (mode === 'database') {
        return handleDatabaseAuth(event, target);
    }

    return handleBasicAuth(event);
});
