// #region Imports
// Types
import type {
    IBrickDataSource,
    IBrickDataSourceParam,
    IBrickDataSourceContext,
} from '../../common/types/dataSource';
import type { IBricksComponent } from '../../common/types/brick';
import type { TPublishFormState } from '../../common/types/bricks-api';

// Composables
import { useApiClient } from '../../common/composables/useApiClient';
// #endregion

/**
 * Composable для работы с data sources опубликованной страницы.
 * Использует useApiClient для проксирования запросов с SSR-заголовками и CSRF.
 *
 * @returns Объект с методом executeDataSource для выполнения запросов к data sources.
 */
export function useBricksDataSources() {
    // #region Data
    const { apiFetcher } = useApiClient();
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
     * Возвращает усечённый превью результата для логов.
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
     * Выполняет запрос к data source и возвращает mapped результат.
     * Собирает параметры, строит URL, выполняет запрос и применяет map функцию.
     *
     * @param source - Определение data source с URL, параметрами и map функцией.
     * @param component - Компонент, для которого выполняется запрос.
     * @param pageSettings - Настройки страницы для разрешения параметров.
     * @returns Результат запроса после применения map функции или null при ошибке.
     */
    async function executeDataSource(
        source: IBrickDataSource,
        component: IBricksComponent,
        pageSettings: TPublishFormState | null
    ): Promise<Record<string, unknown> | null> {
        const params: Record<string, string | number> = {};
        let url = source.url;
        let method = source.method || 'GET';

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
            method = source.method || 'GET';

            if (url.includes(':')) {
                console.warn('[Bricks DataSource] Skip - unresolved params:', {
                    key: source.key,
                    url,
                    component: component.id,
                    params,
                    brickPath: component.brickPath,
                });
                return null;
            }

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

            const response = await apiFetcher<unknown>(url, { method });

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

            const context: IBrickDataSourceContext = {
                pageSettings,
                componentProps: component.props ?? {},
            };

            if (typeof source.map === 'function') {
                const mapped = source.map(response, context);
                console.info('[Bricks DataSource] Mapped result:', {
                    key: source.key,
                    componentId: component.id,
                    brickPath: component.brickPath,
                    mappedKeys: mapped ? Object.keys(mapped) : [],
                    mappedPreview: mapped ? getResponsePreview(mapped) : null,
                });
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
            console.error('[Bricks DataSource] Fetch failed:', {
                key: source.key,
                url,
                method,
                params,
                componentId: component.id,
                brickPath: component.brickPath,
                error,
            });
            return null;
        }
    }
    // #endregion

    return {
        executeDataSource,
    };
}
