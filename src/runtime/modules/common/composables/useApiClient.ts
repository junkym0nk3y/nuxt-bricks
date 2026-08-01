// #region Imports
// Types
import type { IUseApiClientReturn, TApiRequestOptions } from '../types/composables';

// Utils
import {
    applyApiRequestTimeout,
    CLIENT_OWNED_REQUEST_OPTIONS,
    normalizeRequestAbortError,
} from '../utils/apiRequestPolicy';
import { isLocalApiRequest } from '../utils/localApiPaths';
import {
    pickForwardedHeaders,
    pickIdentityHeaders,
    toExternalHeaders,
} from '../utils/ssrRequestHeaders';

// Constants
import { BRICKS_CSRF_HEADER_NAME } from '../constants/auth';

// Composables
import { useBricksRoutePaths } from './useBricksRoutePaths';

// Nuxt
import { useCookie, useRequestEvent, useRuntimeConfig } from '#imports';
// #endregion

// #region Methods
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
 * Маршрутизация запросов (см. common/utils/localApiPaths.ts — общий предикат
 * с серверным devProxy-роутингом):
 * - /api/bricks/** — всегда локальные Nitro-роуты
 *   (persistence выбирается bricks.backend.mode, а не адресом запроса)
 * - остальные /api/* — API host-проекта (server-only bricksProxyUrl),
 *   на клиенте через dev proxy middleware
 *
 * Поддерживает:
 * - CSRF токен из cookie (для REST backend)
 * - Проброс headers на SSR (x-forwarded-*, IP и identity запроса — cookie
 *   сессии и Authorization); identity уходит ТОЛЬКО на локальные
 *   `/api/bricks/**` (common/utils/ssrRequestHeaders.ts)
 * - credentials: 'include' для автоматической отправки cookies на клиенте
 *
 * Базой служит Nuxt/Nitro `$fetch` (globalThis): на SSR относительные URL
 * выполняются внутренним вызовом Nitro-обработчиков (без сети).
 */
export function useApiClient(): IUseApiClientReturn {
    const config = useRuntimeConfig();
    const { builderLoginPath, withBase, stripBase } = useBricksRoutePaths();

    // Проброс headers из SSR-запроса (x-forwarded-*, IP, identity запроса)
    const event = useRequestEvent();

    const appBaseURL = (config.app?.baseURL as string | undefined) || '/';
    const localBaseUrl = resolveLocalBaseUrl(appBaseURL);

    let endpoint = localBaseUrl;

    if (import.meta.server) {
        // SSR: API host-проекта, если задан (server-only ключ — адрес не попадает
        // в client payload). Локальные ручки уходят внутренним вызовом Nitro
        // (см. applyLocalApiRouting).
        const proxyEndpoint = config.bricksProxyUrl as string | undefined;

        if (proxyEndpoint) {
            endpoint = proxyEndpoint;
        }
    }

    const headers = pickForwardedHeaders(event?.node?.req?.headers);
    // Дефолтные заголовки клиента identity НЕ несут — независимо от того, задан
    // внешний endpoint или нет: дефолты уходят с каждым запросом, включая
    // абсолютный URL на чужой origin (для него ofetch не применяет baseURL, а
    // заголовки применяет). Identity добавляется адресно, запросам к локальным
    // ручкам — см. applyLocalApiRouting
    const defaultHeaders = toExternalHeaders(headers);

    // Добавляем CSRF токен из cookie (для Django backend)
    const csrf = useCookie('csrftoken');
    if (csrf.value) {
        defaultHeaders['X-CSRFToken'] = csrf.value as string;
    }

    // CSRF-маркер unsafe-запросов bricks-API: кросс-доменный документ не может
    // поставить кастомный заголовок без CORS-preflight (см. csrfProtection.ts)
    defaultHeaders[BRICKS_CSRF_HEADER_NAME] = '1';

    // База — Nitro-типизированный $Fetch (globalThis): на SSR выполняет
    // относительные URL внутренним вызовом обработчиков
    const rawApiFetcher = globalThis.$fetch.create({
        baseURL: endpoint,
        credentials: 'include', // Для автоматической отправки cookies на клиенте
        headers: defaultHeaders, // Для проброса headers на SSR
        // Без повторов: дефолт ofetch мгновенно повторяет 408/409/425/429/5xx без
        // backoff и без учёта Retry-After — это не политика, а случайность. Если
        // повторы понадобятся, их вводить отдельно: только идемпотентные чтения,
        // задержка и общий бюджет на все попытки
        retry: 0,
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

    /**
     * Приводит опции запроса к локальным ручкам: `/api/bricks/**` уходят на
     * Nuxt-сервер независимо от режима persistence (актуально для SSR с
     * PROXY_URL) и получают identity входящего SSR-запроса — полную cookie
     * (сессия билдера) и `Authorization` (креды basic-режима). Без identity
     * editorial API отвечает им 401, а он защищён целиком.
     *
     * Живёт в обёртке, а не в хуке `onRequest` клиента, потому что ofetch
     * собирает опции вызова как `{ ...defaults, ...call }`: переданный
     * вызывающим `onRequest` ЗАМЕНЯЕТ хук клиента целиком (проверено на
     * ofetch 1.5.1), и маршрутизация вместе с identity молча пропала бы.
     * Сам хук вызывающего при этом не поддерживается вовсе — он исполняется
     * позже обёртки и может увести уже авторизованный запрос на чужой origin
     * (см. `TApiRequestOptions` и снятие ключа в `apiFetcher`).
     *
     * Заголовки вызывающего сохраняются: identity выставляется точечно поверх
     * них, а дефолты клиента ofetch домешивает сам.
     *
     * @param request - Путь или URL запроса.
     * @param requestOptions - Копия опций запроса (мутируется).
     */
    function applyLocalApiRouting(request: string, requestOptions: TApiRequestOptions): void {
        if (!isLocalApiRequest(request)) {
            return;
        }

        requestOptions.baseURL = localBaseUrl;

        // Без раннего выхода на пустой identity: переключение endpoint'а не должно
        // зависеть от того, есть ли в запросе авторизация. Публичные ручки
        // (`components`, health) её не несут, и при заданном PROXY_URL такой
        // запрос ушёл бы на API host-проекта вместо локального обработчика
        const mergedHeaders = new Headers(requestOptions.headers);

        Object.entries(pickIdentityHeaders(headers)).forEach(([name, value]) => {
            mergedHeaders.set(name, value);
        });

        requestOptions.headers = mergedHeaders;
    }

    /**
     * Выполняет запрос с потолком ожидания и опознаваемым обрывом.
     *
     * Потолок ставится здесь, а не в `onRequest`, потому что опознать его
     * срабатывание можно только зная сигнал: в браузере при аборте во время
     * чтения тела платформа подменяет ошибку на `AbortError` и причина теряется
     * (`normalizeRequestAbortError` возвращает её по `reason` сигнала).
     *
     * Опции копируются: вызывающий вправе переиспользовать один объект опций для
     * нескольких запросов, а сигнал у каждого свой — общий объект получил бы от
     * первого запроса уже сработавший.
     *
     * @param request - Путь или URL запроса.
     * @param options - Опции запроса.
     * @returns Тело ответа.
     */
    async function apiFetcher<T = unknown>(
        request: string,
        options: TApiRequestOptions = {}
    ): Promise<T> {
        const requestOptions: TApiRequestOptions = { ...options };

        // Транспортная политика принадлежит клиенту: хуки и повторы снимаются,
        // иначе вызывающий уводит уже авторизованный запрос на чужой адрес —
        // `onRequest` до отправки, остальные хуки вместе с call-level `retry`
        // перед повтором (заголовки повтора те же, с identity)
        CLIENT_OWNED_REQUEST_OPTIONS.forEach((option) => {
            Reflect.deleteProperty(requestOptions, option);
        });

        applyLocalApiRouting(request, requestOptions);
        const effectiveSignal = applyApiRequestTimeout(request, requestOptions);

        try {
            // Через `.raw`, а не прямым вызовом: обёртка передаёт URL переменной, и
            // на ней вывод типа ответа по Nitro-роутам разворачивается в условные
            // типы за пределом рекурсии компилятора. Тело ответа то же самое —
            // прямой вызов ofetch возвращает ровно `_data` этого ответа. Тип
            // задаёт вызывающий дженериком, как и до обёртки
            const response = await rawApiFetcher.raw(request, requestOptions);

            return response._data as T;
        } catch (error: unknown) {
            throw normalizeRequestAbortError(error, effectiveSignal);
        }
    }

    return {
        apiFetcher,
    };
}
