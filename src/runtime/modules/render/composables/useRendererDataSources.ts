// #region Imports
// Types
import type { IPublishedPage } from '../../common/types/bricks-api';
import type { IBricksComponent } from '../../common/types/brick';
import type { IBrickDataSource } from '../../common/types/dataSource';

// Vue
import { computed, onMounted, watch, type ComputedRef } from 'vue';
import { useAsyncData } from '#imports';

// Composables
import { useBrickImports } from '../../common/composables/useBrickImports';
import { useBricksDataSources, type TDataSourceRequestCache } from './useBricksDataSources';

// Utils
import { normalizeBrickPath } from '../../common/utils/bricks/paths';
import { runWithConcurrencyLimit } from '../utils/requestPool';
// #endregion

// #region Interfaces
export interface IRendererDataSourcesOptions {
    /** Данные текущей страницы (live-превью либо payload middleware). */
    page: ComputedRef<IPublishedPage | null>;
    pagename: string;
    isPreview: boolean;
}

export interface IRendererDataSources {
    /** Слепок смёрдженных пропсов для всех компонентов с учётом data sources. */
    resolvedProps: ComputedRef<Record<string, Record<string, unknown>>>;
    /** Перезапускает выполнение data sources (например, при live-обновлении схемы). */
    refreshDataSources: () => Promise<void>;
    /** Промис первичного выполнения — await'ить на top-level setup (SSR-блокировка). */
    ready: Promise<unknown>;
}
// #endregion

/**
 * Выполнение data sources published-страницы: загружает объявления dataSources
 * из brick-файлов (с кешем), выполняет запросы через useAsyncData
 * (SSR — только вне превью) и мержит только запрошенные props.
 * В dev-режиме на клиенте логирует статус/ошибки/слепок resolved props.
 *
 * Синхронный: lifecycle-хуки и watchers регистрируются до любого await,
 * первичное выполнение отдаётся наружу промисом `ready` —
 * его await'ит страница на top-level `<script setup>`.
 *
 * @param options - Страница, pagename и режим превью.
 */
export function useRendererDataSources(options: IRendererDataSourcesOptions): IRendererDataSources {
    const { page, pagename, isPreview } = options;
    const brickDataSourcesCache = new Map<string, IBrickDataSource[] | null>();
    const isClientDataSourceDebug = import.meta.dev && import.meta.client;

    const { findImportModule } = useBrickImports();
    const { executeDataSource: executeDataSourceRequest, concurrency } = useBricksDataSources();
    const dataSourceKey = `bricks-datasources-${pagename}-${isPreview ? 'preview' : 'live'}`;

    /**
     * Загружает dataSources из brick-файла и кеширует результат.
     *
     * @param brickPath - путь до brick-файла.
     * @returns Список dataSources для компонента или пустой массив.
     */
    async function loadBrickDataSources(brickPath: string): Promise<IBrickDataSource[]> {
        if (!brickPath) {
            return [];
        }

        const cacheKey = normalizeBrickPath(brickPath);

        if (brickDataSourcesCache.has(cacheKey)) {
            return brickDataSourcesCache.get(cacheKey) ?? [];
        }

        const importModule = findImportModule(cacheKey) ?? findImportModule(brickPath);

        if (!importModule) {
            brickDataSourcesCache.set(cacheKey, null);
            return [];
        }

        try {
            const brickModule = await importModule();
            const dataSources = (brickModule?.brick?.dataSources ?? []) as IBrickDataSource[];
            brickDataSourcesCache.set(cacheKey, dataSources);
            return dataSources;
        } catch (error) {
            console.error('[Bricks Page] Failed to load dataSources for brick:', brickPath, error);
            brickDataSourcesCache.set(cacheKey, null);
            return [];
        }
    }

    /**
     * Собирает список всех dataSources для компонентов страницы.
     *
     * @returns Список запросов с компонентом и его источником данных.
     */
    async function collectDataSourceRequests(): Promise<
        Array<{ component: IBricksComponent; source: IBrickDataSource }>
    > {
        if (!page.value?.schema?.components?.length) {
            return [];
        }

        const requests: Array<{ component: IBricksComponent; source: IBrickDataSource }> = [];

        // Собираем все data sources, объявленные в brick-файлах компонентов
        for (const component of page.value.schema.components) {
            if (!component.brickPath) {
                continue;
            }

            // Загружаем список источников для конкретного компонента
            const sources = await loadBrickDataSources(component.brickPath);

            // Добавляем каждый источник в очередь выполнения
            sources.forEach((source) => {
                requests.push({ component, source });
            });
        }

        return requests;
    }

    // Считаем и мержим все data sources из bricks для текущей страницы
    const dataSourceAsyncData = useAsyncData<Record<string, Record<string, unknown>>>(
        dataSourceKey,
        async () => {
            if (!page.value) {
                return {};
            }

            const requests = await collectDataSourceRequests();
            const result: Record<string, Record<string, unknown>> = {};

            if (!requests?.length) {
                return {};
            }

            // Кеш ответов одного прогона: одинаковые (method + url) запросы
            // выполняются один раз; новый прогон (refresh) — свежие данные
            const requestCache: TDataSourceRequestCache = new Map();

            // Выполняем с лимитом одновременности (bricks.dataSources.concurrency):
            // страница с десятками компонентов не открывает неограниченное
            // число одновременных запросов на SSR
            await runWithConcurrencyLimit(
                requests.map(({ component, source }) => async () => {
                    const mapped = await executeDataSourceRequest(
                        source,
                        component,
                        page.value,
                        requestCache
                    );

                    if (!mapped) {
                        return;
                    }

                    const target = (result[component.id] ||= {});

                    // Применяем только запрошенные props, чтобы избежать лишнего шумового мерджа
                    source.props.forEach((propName) => {
                        if (propName in mapped) {
                            target[propName] = (mapped as Record<string, unknown>)[propName];
                        }
                    });
                }),
                concurrency
            );

            return result;
        },
        {
            server: !isPreview,
            immediate: !isPreview,
        }
    );

    // Слепок смёрдженных пропсов для всех компонентов с учётом data sources
    const resolvedProps = computed<Record<string, Record<string, unknown>>>(() => {
        return dataSourceAsyncData.data?.value ?? {};
    });

    if (isClientDataSourceDebug) {
        const debugLabel = `[Bricks DataSources][client:${pagename}]`;

        // Логируем смену статуса загрузки data sources (в превью дебаг-режиме)
        watch(
            () => dataSourceAsyncData.status.value,
            (status) => {
                console.info(debugLabel, 'статус изменён:', status);
            },
            { immediate: true }
        );

        // Выводим ошибку загрузки data sources, если она возникла
        watch(
            () => dataSourceAsyncData.error?.value,
            (error) => {
                if (error) {
                    console.error(debugLabel, 'ошибка data source:', error);
                }
            },
            { immediate: true }
        );

        // Снимаем слепок смёрдженных пропсов компонентов после обработки data sources
        watch(
            () => resolvedProps.value,
            (value) => {
                console.info(debugLabel, 'снимок resolved props:', value);
            },
            { deep: true, immediate: true }
        );

        onMounted(() => {
            console.info(debugLabel, 'refreshing data sources on client for logging');
            dataSourceAsyncData.refresh();
        });
    }

    /**
     * Перезапускает выполнение data sources.
     */
    async function refreshDataSources(): Promise<void> {
        await dataSourceAsyncData.refresh();
    }

    return {
        resolvedProps,
        refreshDataSources,
        ready: dataSourceAsyncData,
    };
}
