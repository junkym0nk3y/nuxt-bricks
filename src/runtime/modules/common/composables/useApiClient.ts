// #region Imports
// Types
import type { IncomingHttpHeaders } from 'http';

// Utils
import { stripCookieByName } from '../utils/cookieHeader';

// Constants
import { BRICKS_CSRF_HEADER_NAME, BRICKS_SESSION_COOKIE_NAME } from '../constants/auth';

// Composables
import { useBricksRoutePaths } from './useBricksRoutePaths';

// Nuxt
import { useCookie, useRequestEvent, useRuntimeConfig } from '#imports';
// #endregion

// #region Data
/**
 * Список заголовков, которые нужно пробросить из SSR-запроса в backend-запрос
 */
const targetHeadersList: string[] = [
    'x-real-ip',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-port',
    'x-forwarded-proto',
    'cookie',
];
// #endregion

// #region Methods
/**
 * Извлекает нужные заголовки из SSR-запроса для проброса в backend-запрос
 */
function getHeaders(
    reqHeaders: IncomingHttpHeaders | undefined,
    targetHeadersList: string[]
): Record<string, string> {
    if (!reqHeaders) {
        return {};
    }

    return targetHeadersList.reduce((result: Record<string, string>, header: string) => {
        if (reqHeaders && reqHeaders[header]) {
            result[header] = <string>reqHeaders[header];
        }
        return result;
    }, {});
}

/**
 * Возвращает копию заголовков без cookie сессии bricks: она — секрет билдера
 * и внешнему backend не предназначена; остальные cookie проекта пробрасываются.
 *
 * @param headers - Заголовки, собранные из SSR-запроса.
 */
function toExternalHeaders(headers: Record<string, string>): Record<string, string> {
    const externalHeaders = { ...headers };

    if (externalHeaders.cookie) {
        const cookie = stripCookieByName(externalHeaders.cookie, BRICKS_SESSION_COOKIE_NAME);

        if (cookie) {
            externalHeaders.cookie = cookie;
        } else {
            delete externalHeaders.cookie;
        }
    }

    return externalHeaders;
}

/**
 * Возвращает базовый URL Nuxt-сервера для локальных ручек.
 * SSR: относительный `app.baseURL` — серверный `$fetch` (Nitro) выполняет
 * относительные запросы внутренним вызовом обработчика, без сети и без
 * построения origin из Host-заголовка (host spoofing, см. архитектурный аудит).
 * Клиент: `origin + app.baseURL` — сразу под base, без 302 base-redirect
 * (GET переживает редирект, POST превращается в GET и ломается).
 *
 * @param appBaseURL - `app.baseURL` приложения.
 */
function resolveLocalBaseUrl(appBaseURL: string): string {
    const basePath = appBaseURL.endsWith('/') ? appBaseURL : `${appBaseURL}/`;

    if (import.meta.server) {
        return basePath;
    }

    return `${window.location.origin}${basePath}`;
}
// #endregion

/**
 * Composable для работы с API билдера.
 *
 * Маршрутизация запросов:
 * - /mock-api/* — всегда локальные Nitro-роуты
 * - /api/bricks/** — локальные persistence-ручки, если сконфигурирована БД
 * - остальные /api/* — внешний backend (server-only bricksProxyUrl),
 *   на клиенте через proxy middleware
 *
 * Поддерживает:
 * - CSRF токен из cookie (для REST backend)
 * - Проброс headers на SSR (x-forwarded-*, cookie, IP); cookie сессии bricks
 *   внешнему backend не пробрасывается
 * - credentials: 'include' для автоматической отправки cookies на клиенте
 *
 * Базой служит Nuxt/Nitro `$fetch` (globalThis): на SSR относительные URL
 * выполняются внутренним вызовом Nitro-обработчиков (без сети).
 */
export function useApiClient() {
    const config = useRuntimeConfig();
    const { builderLoginPath, withBase, stripBase } = useBricksRoutePaths();

    // Проброс headers из SSR-запроса (x-forwarded-*, cookie, IP)
    const event = useRequestEvent();

    // Локальный persistence-режим: server-only ключ, на клиенте не читаем
    // (доступ к приватным ключам runtimeConfig на клиенте даёт warning;
    // клиентский роутинг /api/bricks решает proxy middleware)
    const hasLocalDatabase = import.meta.server
        ? Boolean(config.bricksDatabaseUrl as string | undefined)
        : false;

    const appBaseURL = (config.app?.baseURL as string | undefined) || '/';
    const localBaseUrl = resolveLocalBaseUrl(appBaseURL);

    let endpoint = localBaseUrl;

    if (import.meta.server) {
        // SSR: внешний backend, если задан (server-only ключи — адрес не попадает
        // в client payload); ssrUrl побеждает как SSR-специфичный адрес.
        // Локальные ручки уходят внутренним вызовом Nitro (см. onRequest).
        const proxyEndpoint =
            (config.bricksSsrProxyUrl as string | undefined) ||
            (config.bricksProxyUrl as string | undefined);

        if (proxyEndpoint) {
            endpoint = proxyEndpoint;
        }
    }

    const isExternalEndpoint = endpoint !== localBaseUrl;

    const headers = getHeaders(event?.node?.req?.headers, targetHeadersList);
    // Дефолтные заголовки соответствуют дефолтному endpoint инстанса
    const defaultHeaders = isExternalEndpoint ? toExternalHeaders(headers) : headers;

    // Добавляем CSRF токен из cookie (для Django backend)
    const csrf = useCookie('csrftoken');
    if (csrf.value) {
        defaultHeaders['X-CSRFToken'] = csrf.value as string;
    }

    // CSRF-маркер unsafe-запросов bricks-API: кросс-доменный документ не может
    // поставить кастомный заголовок без CORS-preflight (см. csrfProtection.ts)
    defaultHeaders[BRICKS_CSRF_HEADER_NAME] = '1';

    // Тип выводится: Nitro-типизированный $Fetch (globalThis) — на SSR выполняет
    // относительные URL внутренним вызовом обработчиков
    const apiFetcher = globalThis.$fetch.create({
        baseURL: endpoint,
        credentials: 'include', // Для автоматической отправки cookies на клиенте
        headers: defaultHeaders, // Для проброса headers на SSR
        onRequest({ request, options }) {
            if (typeof request !== 'string') {
                return;
            }

            // Локальные ручки: /mock-api/* всегда; /api/bricks/** — при заданной БД
            // (упрощённое зеркало серверного devProxy, актуально для SSR с PROXY_URL)
            const isLocalRoute =
                request.startsWith('/mock-api/') ||
                (hasLocalDatabase && request.startsWith('/api/bricks'));

            if (!isLocalRoute) {
                return;
            }

            options.baseURL = localBaseUrl;

            // Дефолтные заголовки фильтрованы под внешний endpoint —
            // локальным ручкам возвращаем полную cookie (auth-сессия)
            if (isExternalEndpoint && headers.cookie) {
                options.headers.set('cookie', headers.cookie);
            }
        },
        onResponseError({ response }) {
            // Database-auth: мёртвая сессия → полная перезагрузка на login
            // (чисто сбрасывает сторы; вне гарантированного Nuxt-контекста).
            // Страницу логина пропускаем — иначе 401 от auth/me зациклит редирект.
            if (import.meta.server) {
                return;
            }

            const isDatabaseAuth =
                (config.public?.bricksAuthMode as string | undefined) === 'database';
            const { pathname, search } = window.location;
            // location.pathname содержит app.baseURL; redirect-параметр — логический
            // путь (после логина уходит в navigateTo, где base подставит роутер)
            const logicalPath = stripBase(pathname);

            if (!isDatabaseAuth || response.status !== 401 || logicalPath === builderLoginPath) {
                return;
            }

            window.location.assign(
                withBase(builderLoginPath + '?redirect=' + encodeURIComponent(logicalPath + search))
            );
        },
    });

    return {
        apiFetcher,
    };
}
