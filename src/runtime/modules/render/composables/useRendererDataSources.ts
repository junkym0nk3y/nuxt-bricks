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
 * Execution of the data sources of a published page: loads the dataSources
 * declarations out of the brick files (with a cache), performs the requests
 * through useAsyncData (on SSR only outside preview) and merges the requested
 * props only. In dev mode on the client it logs the status, the errors and a
 * snapshot of the resolved props.
 *
 * Synchronous: the lifecycle hooks and the watchers are registered before any
 * await, and the first run is handed out as the `ready` promise — the page awaits
 * it in its top-level `<script setup>`.
 *
 * @param options - The page, its address and the preview mode.
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
    // The key is built from the address, not from the name: for `/blog/post` and
    // `/news/post` it would have been one and the same, and the tabs of two
    // different pages would share the `useAsyncData` state — the second one would
    // get the props of the first.
    // One and the same page label both in the run key and in the logs: in the logs
    // it has to tell pages of the same name apart just as it does in the key
    const addressKey = getPageAddressKey(address);
    const dataSourceKey = `bricks-datasources-${addressKey}-${isPreview ? 'preview' : 'live'}`;

    /**
     * Loads the dataSources out of a brick file and caches the result.
     *
     * @param brickPath - path to the brick file.
     * @returns The list of dataSources for the component, or an empty array.
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
            // A failure is deliberately not cached: the cache lives as long as the page
            // instance, and the client recovery run (`refresh()`) is the second chance for
            // a chunk that did not arrive. Remembering the failure took the sources of
            // that brick out until a remount, with nothing to bring them back
            return [];
        }
    }

    /**
     * Collects the list of all dataSources for the components of the page.
     *
     * @returns The list of requests, each with its component and its data source.
     */
    async function collectDataSourceRequests(): Promise<
        Array<{ component: IBricksComponent; source: IBrickDataSource }>
    > {
        if (!page.value?.schema?.components?.length) {
            return [];
        }

        // Components fit for rendering, with the path kept next to each of them: the
        // stored page could have been corrupted or written around the schema contract —
        // the store is whatever `bricks.backend.mode` points at, our own table or a
        // consumer backend. Garbage elements (null/primitives/objects without
        // id+componentName) are skipped rather than taking SSR down on an access to
        // component.brickPath.
        const renderable: Array<{ component: IBricksComponent; brickPath: string }> = [];

        for (const component of page.value.schema.components) {
            if (!isRenderableSchemaComponent(component) || !component.brickPath) {
                continue;
            }

            renderable.push({ component, brickPath: component.brickPath });
        }

        // The brick modules go out in one wave, one import per distinct path: awaiting
        // them one after another made a waterfall out of the collection — and the page
        // loads the same modules through `prefetchPageBricks` with `Promise.all` anyway,
        // behind the wait for this run
        const loadedSources = await Promise.all(
            Array.from(new Set(renderable.map((entry) => entry.brickPath))).map(
                async (brickPath) => [brickPath, await loadBrickDataSources(brickPath)] as const
            )
        );
        const sourcesByPath = new Map(loadedSources);

        const requests: Array<{ component: IBricksComponent; source: IBrickDataSource }> = [];

        renderable.forEach(({ component, brickPath }) => {
            (sourcesByPath.get(brickPath) ?? []).forEach((source) => {
                requests.push({ component, source });
            });
        });

        return requests;
    }

    // Run and merge all data sources from the bricks of the current page
    const dataSourceAsyncData = useAsyncData<IRendererDataSourcesData>(
        dataSourceKey,
        async () => {
            if (!page.value) {
                return { props: new Map(), isPartial: false };
            }

            // Response cache of one run: identical (method + url) requests run
            // once; a new run (refresh) gets fresh data
            const requestCache: TDataSourceRequestCache = new Map();
            // The run was cut off by time. The flag is raised here, the moment the
            // budget elapses, and not only in the `catch` of the emergency deadline
            // below: wherever abort really works (the client, absolute URLs) the
            // requests do fail on the signal and the run ends normally, so that
            // `catch` never fires — and the result is still incomplete
            let isRunAborted = false;
            // Total wall-clock budget of the run: once it elapses the remaining
            // requests are aborted by the AbortController, and the components stay
            // on fallback props.
            //
            // The clock starts before the collection, not after it: the collection
            // imports the brick modules of the page, and while the timer was armed
            // after it, a hung import sat outside the budget entirely — neither this
            // abort nor the emergency deadline below reached it
            const runStartedAt = Date.now();
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

            /**
             * What is left of the run budget for the phase that follows.
             *
             * @returns Remaining milliseconds, never below zero.
             */
            function remainingBudgetMs(): number {
                return Math.max(0, totalDeadlineMs - (Date.now() - runStartedAt));
            }

            let requests: Array<{ component: IBricksComponent; source: IBrickDataSource }> = [];

            try {
                // The imports listen to no signal — an internal import of a chunk has
                // nothing to listen with — so the collection is bounded by waiting
                // rather than by cancelling, the same way the requests are below
                requests = await withPromiseDeadline(
                    collectDataSourceRequests(),
                    totalDeadlineMs + BRICKS_SSR_DEADLINE_MARGIN_MS,
                    () => createDataSourceDeadlineError(totalDeadlineMs)
                );
            } catch (error: unknown) {
                clearTimeout(deadlineTimer);

                if (!isDataSourceDeadlineError(error)) {
                    throw error;
                }

                console.warn(
                    '[Bricks DataSources] Brick imports abandoned after deadline — no sources run:',
                    {
                        address: addressKey,
                        totalDeadlineMs,
                    }
                );

                return { props: new Map(), isPartial: true };
            }

            if (!requests.length) {
                clearTimeout(deadlineTimer);
                return { props: new Map(), isPartial: isRunAborted };
            }

            // Request budget per run: the excess is dropped with a log entry
            // rather than executed silently
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

            // An accumulator built on Maps: both the component id and the prop
            // names come from the schema and from a brick file, and for
            // `'__proto__'` a `result[id] ||= {}` would hand out
            // `Object.prototype` instead of a fresh bucket
            const result = new Map<string, Map<string, unknown>>();

            try {
                // Run with a concurrency limit (bricks.dataSources.concurrency):
                // a page with dozens of components does not open an unbounded
                // number of simultaneous requests during SSR.
                //
                // The emergency deadline on top of `abortController`: on SSR a
                // relative URL goes out as an internal Nitro call, which does not
                // listen to the signal, so a hung source does not finish on the
                // abort and would hold the visitor's entire SSR response. We stop
                // waiting right here, inside the run — then what did manage to
                // arrive is returned below. An external deadline
                // (`useAsyncData({ timeout })`) will not do for this: it rejects
                // the handler as a whole, and the props that did arrive are lost
                // together with the hung ones
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

                            // Apply the requested props only, to avoid a needless
                            // noisy merge. The check is by own key: for
                            // `'toString'` a `propName in mapped` would have been
                            // true and would have substituted a prototype method
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
                    remainingBudgetMs() + BRICKS_SSR_DEADLINE_MARGIN_MS,
                    () => createDataSourceDeadlineError(totalDeadlineMs)
                );
            } catch (error: unknown) {
                // Swallow our own deadline only: any other error of the run gets out
                if (!isDataSourceDeadlineError(error)) {
                    throw error;
                }

                // There is no need to mark the incompleteness here: the emergency
                // deadline arrives strictly later than the budget of the run
                // (`totalDeadlineMs` plus the margin), that is, the timer above has
                // already fired by this moment. A second assignment would be code
                // there is no way to tell apart from its absence
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

    // Snapshot of the merged props for all components, data sources included
    const resolvedProps = computed<Map<string, Record<string, unknown>>>(() => {
        return dataSourceAsyncData.data?.value?.props ?? new Map();
    });

    if (isClientDataSourceDebug) {
        const debugLabel = `[Bricks DataSources][client:${addressKey}]`;

        // Log every change of the data sources loading status (in preview debug mode)
        watch(
            () => dataSourceAsyncData.status.value,
            (status) => {
                console.info(debugLabel, 'status changed:', status);
            },
            { immediate: true }
        );

        // Print the data sources loading error, if there was one
        watch(
            () => dataSourceAsyncData.error?.value,
            (error) => {
                if (error) {
                    console.error(debugLabel, 'data source error:', error);
                }
            },
            { immediate: true }
        );

        // Take a snapshot of the merged component props once the data sources are done
        watch(
            () => resolvedProps.value,
            (value) => {
                console.info(debugLabel, 'resolved props snapshot:', value);
            },
            { deep: true, immediate: true }
        );
    }

    /**
     * Restarts the data sources run.
     */
    async function refreshDataSources(): Promise<void> {
        await dataSourceAsyncData.refresh();
    }

    // The page is still mounted by the time this starts: the recovery waits for
    // hydration to end, and the visitor may well leave in the meantime. The check
    // does not cancel a run that has already gone out — for that the signal would
    // have to be threaded through the `useAsyncData` handler into the sources
    // client; here it is enough not to start a new run for a page that has already
    // been closed
    let isPageAlive = true;
    let isRecoveryStarted = false;

    /**
     * Completes an incomplete SSR run with a single run from the client, and logs
     * the run in dev — one hook for both jobs, because both come down to the very
     * same `refresh()`: two independent ones would start two runs, of which the
     * `useAsyncData` deduplication (`dedupe: 'cancel'`) would cancel the first.
     *
     * The repeat is needed where the deadline cut some of the sources off: on the
     * server a relative URL goes out as an internal Nitro call and ignores the
     * signal, so a hung source eats the whole budget of the run. In the browser
     * abort actually takes effect, and the sources that never answered get a
     * second chance.
     *
     * Exactly one attempt per page instance. The client run is bounded by the same
     * deadline and is capable of coming out incomplete again, so there must be no
     * second attempt; there is none today anyway — `onNuxtReady` calls the callback
     * once — but the flag makes that a property of the code rather than a
     * coincidence. A live preview (`refreshDataSources`) does not reset the flag:
     * otherwise one permanently hanging source would add a superfluous run to every
     * schema synchronization.
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

        // Let it go: there is nobody to await the result, and the outcome is
        // visible through `resolvedProps`. No `void` here — the `no-void` rule in
        // oxlint
        refreshDataSources().catch((error: unknown) => {
            console.warn('[Bricks DataSources] Partial run recovery failed:', error);
        });
    }

    // `onScopeDispose` with the second argument stays silent outside a component:
    // the composable remains callable in unit tests without a Vue warning
    onScopeDispose(() => {
        isPageAlive = false;
    }, true);

    // Not `onMounted`: the mounted hooks manage to run before Nuxt clears
    // `isHydrating`, and while hydration is going on `refresh()` hands back the
    // same answer out of the payload without performing a run
    // (`getDefaultCachedData`). `onNuxtReady` is tied to `app:suspense:resolve` —
    // the moment when the run really will go out to the network. On the server the
    // hook does nothing
    onNuxtReady(recoverPartialRun);

    return {
        resolvedProps,
        refreshDataSources,
        ready: dataSourceAsyncData,
    };
}
