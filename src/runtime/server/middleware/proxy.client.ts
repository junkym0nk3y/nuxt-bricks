/**
 * Server middleware для проксирования /api запросов на внешний backend.
 *
 * Логика проксирования:
 * - /mock-api/* → НИКОГДА не проксируется (локальные Nitro-роуты)
 * - /api/bricks/** → НЕ проксируется, если сконфигурирована БД
 *   (NUXT_BRICKS_DATABASE_URL / bricks.database.url) —
 *   запросы обслуживают локальные persistence-ручки (см. server/api/bricks/)
 * - остальные /api/* → проксируются на PROXY_URL (если задан)
 *
 * Это позволяет компонентам билдера (.brick.ts) делать API запросы,
 * которые будут проксироваться на backend проекта.
 */

import { createProxyEventHandler } from 'h3-proxy';
import { defineEventHandler, type EventHandler } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';

const config = useRuntimeConfig();
const API_PREFIX = '/api';
const LOCAL_API_PREFIX = '/api/bricks';

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

const proxyTarget = (config.public.PROXY_URL as string | undefined) || '';
const proxyHandler = proxyTarget ? createHandler(proxyTarget, API_PREFIX) : null;

/**
 * Проверяет, сконфигурирована ли локальная БД (persistence-режим).
 */
function hasLocalDatabase(): boolean {
    return Boolean(config.bricksDatabaseUrl as string | undefined);
}

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

    // При сконфигурированной БД /api/bricks/** обслуживают локальные ручки
    if (url.startsWith(LOCAL_API_PREFIX) && hasLocalDatabase()) {
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
