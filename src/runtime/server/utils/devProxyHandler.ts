/**
 * Фабрика event handler'а dev-проксирования (вынесена из middleware для
 * интеграционных тестов на реальных сокетах — test/server/devProxy.spec.ts:
 * middleware завязан на useRuntimeConfig nitropack и вне Nitro не импортируется).
 *
 * Контракт передачи (план backend-connection-modes, PR1): метод, query, body,
 * статус и заголовки проходят как есть в обе стороны. Два отклонения h3
 * proxyRequest компенсируются явно:
 * - `accept` входит в ignoredHeaders h3 → восстанавливается из запроса;
 * - fetch по умолчанию следует редиректам (клиент получал бы финальный 200
 *   без Location) → `redirect: 'manual'` пробрасывает 3xx+Location как есть.
 */

import { createError, defineEventHandler, proxyRequest, type EventHandler, type H3Event } from 'h3';
import { BRICKS_SESSION_COOKIE_NAME } from '../../modules/common/constants/auth';
import { stripCookieByName } from '../../modules/common/utils/cookieHeader';
import {
    buildProxyTargetUrl,
    resolveRequestPathname,
    resolveRequestPathWithQuery,
    shouldProxyRequest,
} from './proxyRouting';

// #region Types
export interface IDevProxyHandlerOptions {
    /** Base URL upstream (PROXY_URL); пустая строка — прокси выключен. */
    proxyUrl: string;
    /** Auth-режим bricks ('basic' | 'database') — управляет вырезанием Authorization. */
    authMode: string;
    /** Таймаут upstream-запроса, мс (дефолт 30000). */
    timeoutMs?: number;
}
// #endregion

// #region Constants
/** Таймаут по умолчанию: зависший backend не должен вешать dev-сервер. */
const DEFAULT_PROXY_TIMEOUT_MS = 30000;
// #endregion

/**
 * Вырезает identity билдера из заголовков запроса перед проброской на внешний
 * backend: cookie сессии database-auth и Authorization в basic-режиме
 * (браузер шлёт креды bricks на все пути origin после первого challenge) —
 * секреты билдера внешнему сервису не предназначены. Остальные cookie
 * и заголовки проекта пробрасываются как есть.
 *
 * @param event - Событие проксируемого запроса (заголовки мутируются in place).
 * @param authMode - Auth-режим bricks.
 */
function stripBricksIdentityHeaders(event: H3Event, authMode: string): void {
    const headers = event.node.req.headers;

    if (headers.cookie) {
        const cookie = stripCookieByName(headers.cookie, BRICKS_SESSION_COOKIE_NAME);
        if (cookie) {
            headers.cookie = cookie;
        } else {
            delete headers.cookie;
        }
    }

    if (authMode === 'basic' && headers.authorization) {
        delete headers.authorization;
    }
}

/**
 * Создаёт event handler dev-проксирования не-bricks /api/* на upstream.
 *
 * @param options - Upstream URL, auth-режим и таймаут.
 * @returns h3 event handler (для middleware devProxy.ts и тестов).
 */
export function createDevProxyEventHandler(options: IDevProxyHandlerOptions): EventHandler {
    const { proxyUrl, authMode } = options;
    const timeoutMs = options.timeoutMs ?? DEFAULT_PROXY_TIMEOUT_MS;

    return defineEventHandler(async (event) => {
        if (!proxyUrl) {
            return;
        }

        const requestUrl = event.node.req.url;
        if (!shouldProxyRequest(resolveRequestPathname(requestUrl))) {
            return;
        }

        stripBricksIdentityHeaders(event, authMode);
        const targetUrl = buildProxyTargetUrl(proxyUrl, resolveRequestPathWithQuery(requestUrl));
        const accept = event.node.req.headers.accept;

        try {
            return await proxyRequest(event, targetUrl, {
                // accept — в ignoredHeaders h3: без явного восстановления
                // upstream видел бы */* вместо заголовка клиента
                headers: accept ? { accept } : undefined,
                fetchOptions: {
                    // 3xx отдаётся клиенту как есть (Location не разворачивается)
                    redirect: 'manual',
                    signal: AbortSignal.timeout(timeoutMs),
                },
            });
        } catch {
            // Стабильный 502 вместо голого fetch-исключения: недоступный/зависший
            // upstream — ошибка шлюза, детали причины наружу не отдаём
            throw createError({ statusCode: 502, statusMessage: 'Bad Gateway' });
        }
    });
}
