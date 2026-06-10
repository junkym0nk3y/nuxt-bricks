// #region Imports
// Types
import type { IncomingHttpHeaders } from 'http';

// Utils
import { getRequestURL, type H3Event } from 'h3';
import { $fetch, type $Fetch } from 'ofetch';
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
 * Извлекает нужные заголовки из SSR-запроса для проброса в backend
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
 * Возвращает базовый URL Nuxt-сервера для ручек, которые нельзя проксировать.
 *
 * @param event - Текущий H3 event или null на клиенте.
 */
function resolveLocalBaseUrl(event: H3Event | null): string {
    if (import.meta.server) {
        if (event) {
            const requestUrl = getRequestURL(event);
            return `${requestUrl.protocol}//${requestUrl.host}/`;
        }

        return 'http://localhost:3000/';
    }

    return `${window.location.origin}/`;
}
// #endregion

/**
 * Composable для работы с API через прокси к Python backend.
 *
 * Все /api/* запросы проксируются на PROXY_URL (Python backend).
 * /mock-api/* запросы обрабатываются локально.
 *
 * Поддерживает:
 * - CSRF токен из cookie (для Django backend)
 * - Проброс headers на SSR (x-forwarded-*, cookie, IP)
 * - credentials: 'include' для автоматической отправки cookies на клиенте
 */
export function useApiClient() {
    const config = useRuntimeConfig();

    let endpoint: string;

    if (import.meta.server) {
        // SSR: используем PROXY_URL или NUXT_SERVER_CACHE_URL для обращения к Python backend
        const proxyEndpoint =
            (config.public?.PROXY_URL as string | undefined) ||
            (config.public?.NUXT_SERVER_CACHE_URL as string | undefined);

        endpoint = proxyEndpoint || 'http://nginx:8088/';
    } else {
        // Client: используем origin чтобы запросы шли через proxy middleware
        endpoint = window.location.origin + '/';
    }

    // Проброс headers из SSR-запроса (x-forwarded-*, cookie, IP)
    const event = useRequestEvent();
    const headers = getHeaders(event?.node?.req?.headers, targetHeadersList);

    // Добавляем CSRF токен из cookie (для Django backend)
    const csrf = useCookie('csrftoken');
    if (csrf.value) {
        headers['X-CSRFToken'] = csrf.value as string;
    }

    const apiFetcher: $Fetch = $fetch.create({
        baseURL: endpoint,
        credentials: 'include', // Для автоматической отправки cookies на клиенте
        headers, // Для проброса headers на SSR
        onRequest({ request, options }) {
            if (typeof request === 'string' && request.startsWith('/mock-api/')) {
                options.baseURL = resolveLocalBaseUrl(event as H3Event | null);
            }
        },
    });

    return {
        apiFetcher,
    };
}
