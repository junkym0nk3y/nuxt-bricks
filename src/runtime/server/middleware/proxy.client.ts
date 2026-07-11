/**
 * Server middleware для проксирования /api запросов на внешний backend.
 *
 * Логика проксирования (чистые правила — server/utils/proxyRouting.ts):
 * - /mock-api/* → НИКОГДА не проксируется (локальные Nitro-роуты)
 * - GET/HEAD /api/bricks/health(/ready) → всегда локально: пробы описывают
 *   этот процесс, а не backend (без локальной БД readiness покрывает только
 *   сам процесс — readiness backend'а в proxy-режиме мониторить напрямую)
 * - /api/bricks/** → НЕ проксируется, если сконфигурирована БД
 *   (NUXT_BRICKS_DATABASE_URL / bricks.database.url) —
 *   запросы обслуживают локальные persistence-ручки (см. server/api/bricks/)
 * - остальные /api/* → проксируются на PROXY_URL (если задан)
 *
 * Это позволяет компонентам билдера (.brick.ts) делать API запросы,
 * которые будут проксироваться на backend проекта.
 */

import { createProxyEventHandler } from 'h3-proxy';
import { defineEventHandler, type EventHandler, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { BRICKS_SESSION_COOKIE_NAME } from '../../modules/common/constants/auth';
import { stripCookieByName } from '../../modules/common/utils/cookieHeader';
import { resolveRequestPathname, shouldProxyRequest } from '../utils/proxyRouting';

const config = useRuntimeConfig();
const API_PREFIX = '/api';

/**
 * Создает proxy handler для проксирования запросов на backend
 */
function createHandler(targetUrl: string, pathPrefix: string): EventHandler | null {
    return createProxyEventHandler({
        target: targetUrl,
        changeOrigin: true,
        pathRewrite: {
            [`^${pathPrefix}`]: 'api',
        },
        pathFilter: `${pathPrefix}/**`,
    });
}

const proxyTarget = (config.bricksProxyUrl as string | undefined) || '';
const proxyHandler = proxyTarget ? createHandler(proxyTarget, API_PREFIX) : null;

/**
 * Проверяет, сконфигурирована ли локальная БД (persistence-режим).
 */
function hasLocalDatabase(): boolean {
    return Boolean(config.bricksDatabaseUrl as string | undefined);
}

/**
 * Вырезает identity билдера из заголовков запроса перед проброской на внешний
 * backend: cookie сессии database-auth и Authorization в basic-режиме
 * (браузер шлёт креды bricks на все пути origin после первого challenge) —
 * секреты билдера внешнему сервису не предназначены. Остальные cookie
 * и заголовки проекта пробрасываются как есть.
 *
 * @param event - Событие проксируемого запроса (заголовки мутируются in place).
 */
function stripBricksIdentityHeaders(event: H3Event): void {
    const headers = event.node.req.headers;

    if (headers.cookie) {
        const cookie = stripCookieByName(headers.cookie, BRICKS_SESSION_COOKIE_NAME);
        if (cookie) {
            headers.cookie = cookie;
        } else {
            delete headers.cookie;
        }
    }

    if (config.bricksAuthMode === 'basic' && headers.authorization) {
        delete headers.authorization;
    }
}

export default defineEventHandler(async (event) => {
    const pathname = resolveRequestPathname(event.node.req.url);
    const shouldProxy = shouldProxyRequest(pathname, {
        method: event.node.req.method || 'GET',
        hasLocalDatabase: hasLocalDatabase(),
    });

    if (shouldProxy && proxyHandler) {
        stripBricksIdentityHeaders(event);
        return proxyHandler(event);
    }
});
