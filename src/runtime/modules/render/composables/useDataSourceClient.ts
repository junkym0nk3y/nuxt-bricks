// #region Imports
// Types
import type { IBricksDataSourcesConfig } from '../../common/types/dataSource';

// Utils
import {
    DEFAULT_DATA_SOURCE_CONCURRENCY,
    DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE,
    DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES,
    DEFAULT_DATA_SOURCE_TIMEOUT_MS,
    DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS,
} from '../utils/dataSourcePolicy';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

/**
 * Отдельный HTTP-клиент для data sources published-страницы — публичный
 * контекст рендера, политики намеренно отличаются от useApiClient (клиент
 * билдера): без проброса cookie и x-forwarded-* (identity посетителя и билдера
 * не утекает во внешний backend), без CSRF, без 401-редиректа на login
 * (ошибка публичного источника данных не должна отправлять посетителя
 * на страницу логина), с таймаутом и без ретраев (детерминированный SSR).
 *
 * Маршрутизация запросов та же, что у остального API: относительные URL на SSR
 * выполняются внутренним вызовом Nitro (в т.ч. через proxy middleware /api/*),
 * на клиенте — под `app.baseURL`. Абсолютные URL допускаются политикой
 * dataSourcePolicy (allow-list хостов) и уходят напрямую.
 *
 * @returns Фетчер и параметры выполнения (allow-list, лимит одновременности,
 * бюджеты размера ответа/числа запросов/суммарного дедлайна — аудит A-09).
 */
export function useDataSourceClient() {
    const config = useRuntimeConfig();
    const dataSourcesConfig = config.public.bricksDataSources as
        | Partial<IBricksDataSourcesConfig>
        | undefined;

    const allowedHosts = dataSourcesConfig?.allowedHosts ?? [];
    const timeoutMs = dataSourcesConfig?.timeoutMs ?? DEFAULT_DATA_SOURCE_TIMEOUT_MS;
    const concurrency = dataSourcesConfig?.concurrency ?? DEFAULT_DATA_SOURCE_CONCURRENCY;
    const maxResponseBytes =
        dataSourcesConfig?.maxResponseBytes ?? DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES;
    const maxRequestsPerPage =
        dataSourcesConfig?.maxRequestsPerPage ?? DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE;
    const totalDeadlineMs =
        dataSourcesConfig?.totalDeadlineMs ?? DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS;

    const appBaseURL = (config.app?.baseURL as string | undefined) || '/';
    const basePath = appBaseURL.endsWith('/') ? appBaseURL : `${appBaseURL}/`;
    // SSR: относительный base — внутренний вызов Nitro без сети и без origin
    // из Host; клиент: origin + base (см. useApiClient.resolveLocalBaseUrl)
    const baseURL = import.meta.server ? basePath : `${window.location.origin}${basePath}`;

    const dataSourceFetcher = globalThis.$fetch.create({
        baseURL,
        timeout: timeoutMs,
        retry: 0,
        // Публичный контекст: cookies посетителя запросам data sources не нужны
        credentials: 'omit',
    });

    return {
        dataSourceFetcher,
        allowedHosts,
        concurrency,
        maxResponseBytes,
        maxRequestsPerPage,
        totalDeadlineMs,
    };
}
