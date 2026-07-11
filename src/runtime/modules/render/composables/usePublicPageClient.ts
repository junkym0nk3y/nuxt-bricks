// #region Imports
// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

// #region Data
/**
 * Таймаут запроса published-страницы: повисший backend не должен держать
 * SSR посетителя дольше этого лимита (паттерн data sources).
 */
export const PUBLIC_PAGE_REQUEST_TIMEOUT_MS = 10_000;
// #endregion

// #region Methods
/**
 * Резолвит base URL для запросов публичного read-model.
 * SSR: относительный `app.baseURL` — серверный `$fetch` (Nitro) выполняет
 * относительные запросы внутренним вызовом обработчика (в т.ч. через proxy
 * middleware /api/*), без построения origin из Host-заголовка.
 * Клиент: `origin + app.baseURL` — сразу под base, без 302 base-redirect.
 *
 * @param appBaseURL - `app.baseURL` приложения.
 * @param isServer - Выполняется ли код на сервере (SSR).
 * @param origin - `window.location.origin` (только на клиенте).
 */
export function resolvePublicPageBaseUrl(
    appBaseURL: string,
    isServer: boolean,
    origin?: string
): string {
    const basePath = appBaseURL.endsWith('/') ? appBaseURL : `${appBaseURL}/`;

    if (isServer) {
        return basePath;
    }

    return `${origin ?? ''}${basePath}`;
}
// #endregion

/**
 * Отдельный HTTP-клиент для lookup'а published-страницы (live-путь рендера) —
 * публичный контекст посетителя, политики намеренно отличаются от useApiClient
 * (клиента билдера): без проброса cookie и x-forwarded-* (identity посетителя
 * не утекает во внешний backend), без CSRF, без 401-редиректа на login
 * (ошибка публичного lookup'а не должна отправлять посетителя на страницу
 * логина билдера — она превращается в 404), с таймаутом и без ретраев
 * (детерминированный SSR). Паттерн — useDataSourceClient.
 *
 * Маршрутизация та же, что у остального API: относительные URL на SSR
 * выполняются внутренним вызовом Nitro (при сконфигурированной БД — локальные
 * persistence-ручки, иначе proxy middleware уводит /api/* на PROXY_URL),
 * на клиенте — под `app.baseURL`.
 *
 * @returns Фетчер публичного read-model.
 */
export function usePublicPageClient() {
    const config = useRuntimeConfig();
    const appBaseURL = (config.app?.baseURL as string | undefined) || '/';

    const baseURL = resolvePublicPageBaseUrl(
        appBaseURL,
        Boolean(import.meta.server),
        import.meta.client ? window.location.origin : undefined
    );

    const publicPageFetcher = globalThis.$fetch.create({
        baseURL,
        timeout: PUBLIC_PAGE_REQUEST_TIMEOUT_MS,
        retry: 0,
        // Публичный контекст: cookies посетителя lookup'у страницы не нужны
        credentials: 'omit',
    });

    return {
        publicPageFetcher,
    };
}
