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
import {
    DataSourceHttpError,
    readResponseWithinByteBudget,
} from '../utils/dataSourceResponseReading';

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

    const rawDataSourceFetcher = globalThis.$fetch.create({
        baseURL,
        timeout: timeoutMs,
        retry: 0,
        // Публичный контекст: cookies посетителя запросам data sources не нужны
        credentials: 'omit',
    });

    /**
     * Фетчер data source: HTTP — через ofetch (baseURL/таймаут/без ретраев),
     * тело — потоковое чтение с байтовым бюджетом ДО JSON.parse (ре-ревью
     * A-09: крупный ответ обрывается на чтении, а не замеряется после полной
     * буферизации и разбора).
     *
     * @param url - Резолвленный URL запроса.
     * @param options - Метод и опциональный сигнал отмены.
     * @returns Распарсенное тело ответа.
     * @throws DataSourceResponseTooLargeError при превышении maxResponseBytes.
     */
    async function dataSourceFetcher<T>(
        url: string,
        options: { method: 'GET' | 'HEAD'; signal?: AbortSignal }
    ): Promise<T> {
        // ignoreResponseError: дефолтный throw ofetch на 4xx/5xx оставил бы
        // поток тела непрочитанным и неотменённым — статус обрабатывается
        // ниже сами, после освобождения потока (ре-ревью A-09)
        const response = await rawDataSourceFetcher.raw(url, {
            ...options,
            responseType: 'stream',
            ignoreResponseError: true,
        });

        if (response.status >= 400) {
            // Тело ошибки не используется — отменяем поток вместо чтения
            await response.body?.cancel().catch(() => undefined);
            throw new DataSourceHttpError(response.status);
        }

        return (await readResponseWithinByteBudget(response, maxResponseBytes)) as T;
    }

    return {
        dataSourceFetcher,
        allowedHosts,
        concurrency,
        timeoutMs,
        maxResponseBytes,
        maxRequestsPerPage,
        totalDeadlineMs,
    };
}
