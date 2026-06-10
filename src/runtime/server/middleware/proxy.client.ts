/**
 * Server middleware для проксирования /api запросов на Python backend.
 *
 * Логика проксирования:
 * - Все /api/* → проксируются на PROXY_URL
 * - /mock-api/* → НИКОГДА не проксируется (локальный json)
 *
 * Это позволяет компонентам билдера (.brick.ts) делать API запросы,
 * которые будут проксироваться на backend.
 */

import { createProxyEventHandler } from 'h3-proxy';
import { defineEventHandler, type EventHandler } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';

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

const proxyHandler = config.public.PROXY_URL
    ? createHandler(config.public.PROXY_URL, API_PREFIX)
    : null;

/**
 * Проверяет, должен ли URL проксироваться на backend
 */
function shouldProxy(url: string | undefined): boolean {
    if (!url) {
        return false;
    }

    // Mock API - НИКОГДА не проксируем
    if (url.startsWith('/mock-api')) {
        return false;
    }

    // Все /api/** - проксируем если есть PROXY_URL
    if (url.startsWith(API_PREFIX)) {
        return true;
    }

    return false;
}

export default defineEventHandler(async (event) => {
    const url = event.node.req.url;

    if (shouldProxy(url) && proxyHandler) {
        return proxyHandler(event);
    }
});
