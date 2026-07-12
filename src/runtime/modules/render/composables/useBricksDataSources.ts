// #region Imports
// Types
import type {
    IBrickDataSource,
    IBrickDataSourceParam,
    IBrickDataSourceContext,
} from '../../common/types/dataSource';
import type { IBricksComponent } from '../../common/types/brick';
import type { TPublishFormState } from '../../common/types/bricks-api';

// Utils
import {
    checkDataSourceUrl,
    measureResponseSizeBytes,
    resolveDataSourceMethod,
    type TResolvedDataSourceMethod,
} from '../utils/dataSourcePolicy';
import { resolveDataSourceLogTarget, toDataSourceLogError } from '../utils/dataSourceLogging';

// Composables
import { useDataSourceClient } from './useDataSourceClient';
// #endregion

// #region Types
/** Кеш ответов одного прогона: одинаковые (method + url) запросы выполняются один раз. */
export type TDataSourceRequestCache = Map<string, Promise<unknown>>;
// #endregion

/**
 * Composable для работы с data sources опубликованной страницы.
 * Запросы идут через выделенный публичный клиент (useDataSourceClient):
 * без cookie/identity, с таймаутом; URL и метод проверяются политикой
 * (dataSourcePolicy) — относительные URL или allow-list хостов, только GET/HEAD.
 *
 * Логи: подробности (props, параметры, полный URL, превью ответа, сырая ошибка) —
 * только в dev; в production URL сворачивается до цели (`local`/origin), ошибка —
 * до `{ name, statusCode }` (см. utils/dataSourceLogging) — резолвленный URL
 * содержит подставленные значения props/страницы и в prod-логи не попадает.
 *
 * @returns Метод executeDataSource и бюджеты выполнения (лимит одновременности,
 * максимум запросов на прогон, суммарный дедлайн) из конфигурации.
 */
export function useBricksDataSources() {
    // #region Data
    const {
        dataSourceFetcher,
        allowedHosts,
        concurrency,
        maxResponseBytes,
        maxRequestsPerPage,
        totalDeadlineMs,
    } = useDataSourceClient();
    // #endregion

    // #region Methods
    /**
     * Извлекает значение по строковому пути из объекта.
     *
     * @param source - Исходный объект для извлечения значения.
     * @param path - Путь к значению в формате 'key.nested.value'.
     * @returns Значение по указанному пути или undefined, если путь не найден.
     *
     */
    function getValueByPath(source: object | null, path: string): unknown {
        if (!path) {
            return undefined;
        }

        return path.split('.').reduce<unknown>((acc, segment) => {
            if (acc && typeof acc === 'object' && segment in acc) {
                return (acc as Record<string, unknown>)[segment];
            }
            return undefined;
        }, source);
    }

    /**
     * Разрешает значение параметра из component props или page settings.
     * Поддерживает прямые значения, пути к данным и функции маппинга.
     *
     * @param param - Определение параметра data source.
     * @param component - Компонент, для которого разрешается параметр.
     * @param pageSettings - Настройки страницы (pagename, title и т.д.).
     * @returns Разрешённое значение параметра или undefined.
     */
    function resolveParamValue(
        param: IBrickDataSourceParam,
        component: IBricksComponent,
        pageSettings: TPublishFormState | null
    ): unknown {
        const context: IBrickDataSourceContext = {
            pageSettings,
            componentProps: component.props ?? {},
        };

        if (param.value !== undefined) {
            return param.map ? param.map(param.value, context) : param.value;
        }

        if (!param.from) {
            return undefined;
        }

        const sourceValue = param.from.startsWith('component.')
            ? getValueByPath(component.props ?? {}, param.from.replace('component.', ''))
            : getValueByPath(pageSettings, param.from);

        return param.map ? param.map(sourceValue, context) : sourceValue;
    }

    /**
     * Подставляет параметры в URL, заменяя :paramName на значения.
     *
     * @param url - URL с плейсхолдерами вида :paramName.
     * @param params - Объект с параметрами для подстановки.
     * @returns URL с подставленными значениями параметров.
     *
     * @example
     * ```ts
     * buildDataSourceUrl('/api/users/:id', { id: 123 }); // '/api/users/123'
     * ```
     */
    function buildDataSourceUrl(url: string, params: Record<string, string | number>): string {
        return url.replace(/:([a-zA-Z0-9_]+)/g, (match, key) => {
            if (key in params) {
                return encodeURIComponent(String(params[key]));
            }
            return match;
        });
    }

    /**
     * Возвращает усечённый превью результата для dev-логов.
     * Ограничивает массивы до 3 элементов, объекты до 5 ключей.
     *
     * @param value - Значение для создания превью.
     * @returns Усечённое значение для отображения в логах.
     */
    function getResponsePreview(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.slice(0, 3);
        }

        if (value && typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>).slice(0, 5);
            return Object.fromEntries(entries);
        }

        return value;
    }

    /**
     * Проверяет, остались ли в URL неразрешённые плейсхолдеры :paramName.
     * Для абсолютного URL проверяется только path + query (двоеточия схемы
     * и порта — не плейсхолдеры).
     *
     * @param url - URL после подстановки параметров.
     * @returns true, если в URL остался незаполненный плейсхолдер.
     */
    function hasUnresolvedParams(url: string): boolean {
        let checkedPart = url;

        if (!url.startsWith('/')) {
            try {
                const parsed = new URL(url);
                checkedPart = `${parsed.pathname}${parsed.search}`;
            } catch {
                // Не абсолютный URL — проверяем строку целиком (политика отфильтрует)
            }
        }

        return checkedPart.includes(':');
    }

    /**
     * Дополняет redacted prod-payload лога подробными полями в dev-режиме.
     * В production возвращает payload как есть (детали не логируются).
     *
     * @param payload - Безопасный payload для production-лога.
     * @param devDetails - Подробные поля (url/params/сырая ошибка) для dev.
     * @returns Итоговый payload лога.
     */
    function withDevLogDetails(
        payload: Record<string, unknown>,
        devDetails: Record<string, unknown>
    ): Record<string, unknown> {
        return import.meta.dev ? { ...payload, ...devDetails } : payload;
    }

    /**
     * Выполняет HTTP-запрос data source с дедупликацией по (method + url):
     * одинаковые запросы одного прогона делят один промис.
     *
     * @param url - Резолвленный URL запроса.
     * @param method - Нормализованный HTTP-метод.
     * @param requestCache - Кеш ответов текущего прогона (опционален).
     * @param signal - Сигнал отмены (общий дедлайн прогона — аудит A-09); в ключ
     * кеша не входит, чтобы дедуп по (method + url) не зависел от прогона.
     * @returns Сырой ответ запроса.
     */
    function fetchDataSource(
        url: string,
        method: TResolvedDataSourceMethod,
        requestCache?: TDataSourceRequestCache,
        signal?: AbortSignal
    ): Promise<unknown> {
        const cacheKey = `${method} ${url}`;
        const cached = requestCache?.get(cacheKey);

        if (cached) {
            return cached;
        }

        const responsePromise = dataSourceFetcher<unknown>(url, { method, signal });
        requestCache?.set(cacheKey, responsePromise);

        return responsePromise;
    }

    /**
     * Выполняет запрос к data source и возвращает mapped результат.
     * Собирает параметры, строит URL, проверяет политику (метод/URL),
     * выполняет запрос и применяет map функцию.
     *
     * @param source - Определение data source с URL, параметрами и map функцией.
     * @param component - Компонент, для которого выполняется запрос.
     * @param pageSettings - Настройки страницы для разрешения параметров.
     * @param requestCache - Кеш ответов текущего прогона (dedup одинаковых запросов).
     * @param signal - Сигнал отмены общего дедлайна прогона (аудит A-09);
     * отменённый запрос попадает в общий catch → null → fallback props компонента.
     * @returns Результат запроса после применения map функции или null при ошибке.
     */
    async function executeDataSource(
        source: IBrickDataSource,
        component: IBricksComponent,
        pageSettings: TPublishFormState | null,
        requestCache?: TDataSourceRequestCache,
        signal?: AbortSignal
    ): Promise<Record<string, unknown> | null> {
        const params: Record<string, string | number> = {};
        let url = source.url;

        const method = resolveDataSourceMethod(source.method);

        if (!method) {
            console.warn('[Bricks DataSource] Skip - method is not allowed (GET/HEAD only):', {
                key: source.key,
                method: source.method,
                componentId: component.id,
                brickPath: component.brickPath,
            });
            return null;
        }

        try {
            if (source.params) {
                Object.entries(source.params).forEach(([key, param]) => {
                    const value = resolveParamValue(param, component, pageSettings);
                    if (value !== undefined && value !== null) {
                        params[key] = value as string | number;
                    }
                });
            }

            url = buildDataSourceUrl(source.url, params);

            if (hasUnresolvedParams(url)) {
                console.warn(
                    '[Bricks DataSource] Skip - unresolved params:',
                    withDevLogDetails(
                        {
                            key: source.key,
                            target: resolveDataSourceLogTarget(url),
                            componentId: component.id,
                            brickPath: component.brickPath,
                        },
                        { url, params }
                    )
                );
                return null;
            }

            const urlCheck = checkDataSourceUrl(url, allowedHosts);

            if (!urlCheck.allowed) {
                console.warn(
                    '[Bricks DataSource] Skip - url is not allowed by policy:',
                    withDevLogDetails(
                        {
                            key: source.key,
                            target: resolveDataSourceLogTarget(url),
                            reason: urlCheck.reason,
                            componentId: component.id,
                            brickPath: component.brickPath,
                        },
                        { url }
                    )
                );
                return null;
            }

            if (import.meta.dev) {
                console.info('[Bricks DataSource] Fetching:', {
                    key: source.key,
                    url,
                    method,
                    params,
                    componentId: component.id,
                    brickPath: component.brickPath,
                    componentProps: component.props,
                    page: pageSettings?.pagename,
                });
            }

            const response = await fetchDataSource(url, method, requestCache, signal);
            const responseSizeBytes = measureResponseSizeBytes(response);

            if (responseSizeBytes > maxResponseBytes) {
                console.warn(
                    '[Bricks DataSource] Skip - response exceeds byte budget:',
                    withDevLogDetails(
                        {
                            key: source.key,
                            target: resolveDataSourceLogTarget(url),
                            responseSizeBytes,
                            maxResponseBytes,
                            componentId: component.id,
                            brickPath: component.brickPath,
                        },
                        { url }
                    )
                );
                return null;
            }

            if (import.meta.dev) {
                console.info('[Bricks DataSource] Response received:', {
                    key: source.key,
                    url,
                    method,
                    componentId: component.id,
                    brickPath: component.brickPath,
                    responseType: Array.isArray(response) ? 'array' : typeof response,
                    responsePreview: getResponsePreview(response),
                    hasData: Boolean(response),
                });
            }

            const context: IBrickDataSourceContext = {
                pageSettings,
                componentProps: component.props ?? {},
            };

            if (typeof source.map === 'function') {
                const mapped = source.map(response, context);

                if (import.meta.dev) {
                    console.info('[Bricks DataSource] Mapped result:', {
                        key: source.key,
                        componentId: component.id,
                        brickPath: component.brickPath,
                        mappedKeys: mapped ? Object.keys(mapped) : [],
                        mappedPreview: mapped ? getResponsePreview(mapped) : null,
                    });
                }

                return mapped;
            }

            if (Array.isArray(response)) {
                return { data: response };
            }

            if (response && typeof response === 'object') {
                return response as Record<string, unknown>;
            }

            return null;
        } catch (error) {
            // В production ни url, ни params, ни сырую ошибку не логируем:
            // резолвленный url содержит значения props/страницы, ofetch-error —
            // request/response/options целиком
            console.error(
                '[Bricks DataSource] Fetch failed:',
                withDevLogDetails(
                    {
                        key: source.key,
                        target: resolveDataSourceLogTarget(url),
                        method,
                        componentId: component.id,
                        brickPath: component.brickPath,
                        error: toDataSourceLogError(error),
                    },
                    { url, params, rawError: error }
                )
            );
            return null;
        }
    }
    // #endregion

    return {
        executeDataSource,
        concurrency,
        maxRequestsPerPage,
        totalDeadlineMs,
    };
}
