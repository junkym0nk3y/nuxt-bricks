// #region Imports
// Types
import type { IBricksComponent } from '../../common/types/brick';
import type { IBrickDataSource } from '../../common/types/dataSource';
import type {
    IRendererDataSources,
    IRendererDataSourcesData,
    IRendererDataSourcesOptions,
    TDataSourceRequestCache,
} from '../types/composables';

// Vue
import { computed, onScopeDispose, watch } from 'vue';
import { onNuxtReady, useAsyncData } from '#imports';

// Composables
import { useBrickImports } from '../../common/composables/useBrickImports';
import { useBricksDataSources } from './useBricksDataSources';

// Utils
import { normalizeBrickPath } from '../../common/utils/bricks/paths';
import { isRenderableSchemaComponent } from '../../common/utils/bricks/schemaContract';
import { hasOwnKey, toSafeRecord } from '../../common/utils/safeRecord';
import { withPromiseDeadline } from '../../common/utils/promiseDeadline';
import { runWithConcurrencyLimit } from '../utils/requestPool';
import {
    createDataSourceDeadlineError,
    isDataSourceDeadlineError,
} from '../utils/dataSourcePolicy';

// Constants
import { BRICKS_SSR_DEADLINE_MARGIN_MS } from '../../common/constants/apiTimeouts';

// Utils
import { getPageAddressKey } from '../../common/utils/bricks/pageAddress';
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
 * @param options - Страница, её адрес и режим превью.
 */
export function useRendererDataSources(options: IRendererDataSourcesOptions): IRendererDataSources {
    const { page, address, isPreview } = options;
    const brickDataSourcesCache = new Map<string, IBrickDataSource[] | null>();
    const isClientDataSourceDebug = import.meta.dev && import.meta.client;

    const { findImportModule } = useBrickImports();
    const {
        executeDataSource: executeDataSourceRequest,
        concurrency,
        maxRequestsPerPage,
        totalDeadlineMs,
    } = useBricksDataSources();
    // Ключ по адресу, а не по имени: у `/blog/post` и `/news/post` он был бы один,
    // и вкладки двух разных страниц делили бы состояние `useAsyncData` — вторая
    // получила бы props первой
    // Один и тот же ярлык страницы и в ключе прогона, и в логах: в логах он
    // должен различать одноимённые страницы так же, как в ключе
    const addressKey = getPageAddressKey(address);
    const dataSourceKey = `bricks-datasources-${addressKey}-${isPreview ? 'preview' : 'live'}`;

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

        const importModule = findImportModule(brickPath);

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

        // Собираем все data sources, объявленные в brick-файлах компонентов.
        // Строка БД могла быть повреждена или записана в обход контракта
        // схемы: мусорные элементы (null/примитивы/объекты без
        // id+componentName) пропускаются, а не роняют SSR обращением к
        // component.brickPath.
        for (const component of page.value.schema.components) {
            if (!isRenderableSchemaComponent(component) || !component.brickPath) {
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
    const dataSourceAsyncData = useAsyncData<IRendererDataSourcesData>(
        dataSourceKey,
        async () => {
            if (!page.value) {
                return { props: new Map(), isPartial: false };
            }

            const requests = await collectDataSourceRequests();

            if (!requests?.length) {
                return { props: new Map(), isPartial: false };
            }

            // Бюджет запросов на прогон: излишек отбрасывается с логом,
            // а не выполняется молча
            const limitedRequests = requests.slice(0, maxRequestsPerPage);

            if (limitedRequests.length < requests.length) {
                console.warn(
                    '[Bricks DataSources] Request budget exceeded — extra sources skipped:',
                    {
                        address: addressKey,
                        total: requests.length,
                        executed: limitedRequests.length,
                    }
                );
            }

            // Кеш ответов одного прогона: одинаковые (method + url) запросы
            // выполняются один раз; новый прогон (refresh) — свежие данные
            const requestCache: TDataSourceRequestCache = new Map();
            // Прогон оборван по времени. Помечается здесь, в момент истечения
            // бюджета, а не только в `catch` аварийного дедлайна ниже: там, где
            // abort работает (клиент, абсолютные URL), запросы честно падают по
            // сигналу и прогон завершается штатно — `catch` не срабатывает вовсе,
            // а результат при этом всё равно неполон
            let isRunAborted = false;
            // Общий wall-clock budget прогона: по истечении оставшиеся запросы
            // прерываются AbortController'ом, компоненты остаются на fallback props
            const abortController = new AbortController();
            const deadlineTimer = setTimeout(() => {
                console.warn(
                    '[Bricks DataSources] Total deadline exceeded — aborting remaining requests:',
                    {
                        address: addressKey,
                        totalDeadlineMs,
                    }
                );
                isRunAborted = true;
                abortController.abort();
            }, totalDeadlineMs);

            // Аккумулятор на Map'ах: и id компонента, и имена пропсов приходят
            // из схемы и brick-файла, а `result[id] ||= {}` для `'__proto__'`
            // отдал бы `Object.prototype` вместо новой корзины
            const result = new Map<string, Map<string, unknown>>();

            try {
                // Выполняем с лимитом одновременности (bricks.dataSources.concurrency):
                // страница с десятками компонентов не открывает неограниченное
                // число одновременных запросов на SSR.
                //
                // Аварийный дедлайн поверх `abortController`: на SSR относительный
                // URL уходит внутренним вызовом Nitro, который сигнал не слушает,
                // поэтому зависший источник не завершается по аборту и держал бы
                // весь SSR-ответ посетителя. Ждать перестаём здесь же, внутри
                // прогона, — тогда ниже возвращается то, что успело дойти. Внешний
                // дедлайн (`useAsyncData({ timeout })`) для этого не годится: он
                // отклоняет handler целиком, и успевшие props пропадают вместе с
                // зависшими (находка ревью)
                await withPromiseDeadline(
                    runWithConcurrencyLimit(
                        limitedRequests.map(({ component, source }) => async () => {
                            if (abortController.signal.aborted) {
                                return;
                            }

                            const mapped = await executeDataSourceRequest(
                                source,
                                component,
                                page.value,
                                requestCache,
                                abortController.signal
                            );

                            if (!mapped) {
                                return;
                            }

                            const target = result.get(component.id) ?? new Map<string, unknown>();
                            result.set(component.id, target);

                            // Применяем только запрошенные props, чтобы избежать лишнего
                            // шумового мерджа. Проверка — по own-ключу: `propName in mapped`
                            // для `'toString'` был бы истинным и подставил бы метод прототипа
                            source.props.forEach((propName) => {
                                if (hasOwnKey(mapped, propName)) {
                                    target.set(
                                        propName,
                                        (mapped as Record<string, unknown>)[propName]
                                    );
                                }
                            });
                        }),
                        concurrency
                    ),
                    totalDeadlineMs + BRICKS_SSR_DEADLINE_MARGIN_MS,
                    () => createDataSourceDeadlineError(totalDeadlineMs)
                );
            } catch (error: unknown) {
                // Гасим только свой дедлайн: любая другая ошибка прогона — наружу
                if (!isDataSourceDeadlineError(error)) {
                    throw error;
                }

                // Помечать неполноту здесь не нужно: аварийный дедлайн наступает
                // строго позже бюджета прогона (`totalDeadlineMs` + запас), то
                // есть таймер выше к этому моменту уже сработал. Второе
                // присваивание было бы кодом, который нечем отличить от его
                // отсутствия
                console.warn(
                    '[Bricks DataSources] Run abandoned after deadline — returning partial props:',
                    {
                        address: addressKey,
                        totalDeadlineMs,
                        resolvedComponents: result.size,
                    }
                );
            } finally {
                clearTimeout(deadlineTimer);
            }

            return {
                props: new Map(
                    Array.from(result, ([componentId, propValues]) => [
                        componentId,
                        toSafeRecord(propValues),
                    ])
                ),
                isPartial: isRunAborted,
            };
        },
        {
            server: !isPreview,
            immediate: !isPreview,
        }
    );

    // Слепок смёрдженных пропсов для всех компонентов с учётом data sources
    const resolvedProps = computed<Map<string, Record<string, unknown>>>(() => {
        return dataSourceAsyncData.data?.value?.props ?? new Map();
    });

    if (isClientDataSourceDebug) {
        const debugLabel = `[Bricks DataSources][client:${addressKey}]`;

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
    }

    /**
     * Перезапускает выполнение data sources.
     */
    async function refreshDataSources(): Promise<void> {
        await dataSourceAsyncData.refresh();
    }

    // Страница ещё смонтирована на момент запуска: восстановление ждёт конца
    // гидрации, а посетитель за это время успевает уйти. Уже улетевший прогон
    // проверка не отменяет — для этого сигнал пришлось бы протаскивать через
    // handler `useAsyncData` в клиент источников; здесь достаточно не начинать
    // новый прогон для страницы, которую уже закрыли
    let isPageAlive = true;
    let isRecoveryStarted = false;

    /**
     * Догоняет неполный SSR-прогон одним прогоном с клиента и логирует прогон в
     * dev — один хук на оба дела, потому что оба сводятся к одному и тому же
     * `refresh()`: два независимых запустили бы два прогона, из которых
     * дедупликация `useAsyncData` (`dedupe: 'cancel'`) отменила бы первый.
     *
     * Повтор нужен там, где дедлайн оборвал часть источников: на сервере
     * относительный URL уходит внутренним вызовом Nitro и сигнал не слушает,
     * поэтому зависший источник забирает весь бюджет прогона. В браузере обрыв
     * работает честно, и у не ответивших источников появляется второй шанс.
     *
     * Ровно одна попытка на экземпляр страницы. Клиентский прогон ограничен тем же
     * дедлайном и способен снова выйти неполным, поэтому второй попытки быть не
     * должно; сегодня её и так нет — `onNuxtReady` зовёт колбэк единожды, — но
     * флаг делает это свойством кода, а не совпадением. Живое превью
     * (`refreshDataSources`) флаг не сбрасывает: иначе один постоянно зависающий
     * источник добавлял бы лишний прогон к каждой синхронизации схемы.
     */
    function recoverPartialRun(): void {
        const isDebugRefreshNeeded = isClientDataSourceDebug;
        const isRecoveryNeeded =
            !isPreview && !isRecoveryStarted && dataSourceAsyncData.data.value?.isPartial === true;

        if (!isPageAlive || (!isRecoveryNeeded && !isDebugRefreshNeeded)) {
            return;
        }

        isRecoveryStarted = true;

        if (isDebugRefreshNeeded) {
            console.info(
                `[Bricks DataSources][client:${addressKey}]`,
                'refreshing data sources on client',
                { isPartialRun: isRecoveryNeeded }
            );
        }

        // Отпускаем: ждать результат некому, а исход виден по `resolvedProps`.
        // `void` не пишем — правило `no-void` в oxlint
        refreshDataSources().catch((error: unknown) => {
            console.warn('[Bricks DataSources] Partial run recovery failed:', error);
        });
    }

    // `onScopeDispose` со вторым аргументом молчит вне компонента: композабл
    // остаётся вызываемым в unit-тестах без предупреждения Vue
    onScopeDispose(() => {
        isPageAlive = false;
    }, true);

    // Не `onMounted`: mounted-хуки успевают отработать до того, как Nuxt снимет
    // `isHydrating`, а пока гидрация идёт, `refresh()` отдаёт тот же ответ из
    // payload, не выполняя прогон (`getDefaultCachedData`). `onNuxtReady` привязан
    // к `app:suspense:resolve` — моменту, когда прогон действительно уйдёт в сеть.
    // На сервере хук не делает ничего
    onNuxtReady(recoverPartialRun);

    return {
        resolvedProps,
        refreshDataSources,
        ready: dataSourceAsyncData,
    };
}
