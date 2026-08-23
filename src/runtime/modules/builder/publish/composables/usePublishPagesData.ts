// #region Imports
// Types
import type {
    IPublishPagesData,
    IUsePublishPagesDataOptions,
    IUsePublishPagesDataReturn,
} from '../types/composables';

// Utils
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed, onScopeDispose, ref, watch } from 'vue';

// Nuxt
import { onNuxtReady, useAsyncData } from '#imports';

// Pinia
import { usePublishStore } from '../stores/publish';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';
// #endregion

/**
 * The cache key of the list: one per application — the dashboard and the builder
 * share one list.
 */
const PAGES_ASYNC_DATA_KEY = 'bricks-pages';

/**
 * Bounds the waiting for the list on SSR.
 *
 * The transport ceiling is inert here: a relative URL goes out as an internal
 * Nitro call, and that one does not listen to an `AbortSignal`. Without an external
 * deadline a hung request would hold not the list but the whole answer of the page:
 * back when the list was loaded from the client, a hang left a person with a
 * working dashboard, whereas the server-side waiting will not hand them any HTML at
 * all. The deadline does not abort a hung request — it only stops waiting for it;
 * the resource itself is bounded by the server-side limit of the storage.
 *
 * The error of the deadline is not told from the other refusals: on the server both
 * outcomes lead into the same degradation, and telling them apart would be
 * knowledge with no consumer.
 *
 * @param request - The promise of loading the list into the store.
 * @returns The same promise; on the client, with no deadline.
 */
function loadPagesWithinDeadline(request: Promise<void>): Promise<void> {
    if (!import.meta.server) {
        return request;
    }

    const deadlineMs = BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS;

    return withPromiseDeadline(
        request,
        deadlineMs,
        () => new Error(`Pages list did not arrive within ${deadlineMs} ms`)
    );
}

/**
 * Loads the page list of the dashboard on the server, so that the markup of the
 * first frame arrives with the pages in it already. The list used to be loaded from
 * `onMounted`, and the SSR markup went out to a person with an empty list — until
 * the endpoint answered they saw not a spinner but the empty state "no pages yet".
 *
 * The result is put into `publishStore.publishedPages` — the single source of the
 * list: the bootstrap of a builder session takes it from there too, and it goes out
 * for the list only until a full one has arrived (`ensureAllPagesLoaded` looks at
 * `pagesLoadedAt` rather than at the length of the array — locally synchronized rows
 * are not a snapshot). The loading runs through the `loadAllPages` store action
 * rather than through a request of its own, so that the list keeps one point of
 * writing together with its protection against stale answers.
 *
 * A refusal on the server does not reject the load but marks it degraded: a
 * rejection would land in `payload._errors`, and on a hydration carrying an error
 * Nuxt skips the first request — the list would stay empty until a full reload,
 * which would go into that same SSR again. The client repeats the request once and
 * fixes both outcomes — a dead session of the database mode included, where a 401
 * on the client takes the person to the login (on the server the 401 handler
 * returns at once and performs no redirect).
 *
 * @param options - The callback for a refused load (a toast of the dashboard).
 * @returns The flag of a load in progress for the page list.
 */
export async function usePublishPagesData(
    options: IUsePublishPagesDataOptions
): Promise<IUsePublishPagesDataReturn> {
    const publishStore = usePublishStore();

    // The `useAsyncData` promise is deliberately not awaited here: the recovery
    // and the refusal watcher have to be registered synchronously before an await,
    // and after one the active scope is lost
    const pagesData = useAsyncData<IPublishPagesData>(PAGES_ASYNC_DATA_KEY, async () => {
        try {
            await loadPagesWithinDeadline(publishStore.loadAllPages());
        } catch (error: unknown) {
            if (!import.meta.server) {
                throw error;
            }

            console.warn('[BricksBuilder] Pages list SSR load failed:', error);

            return { isPartial: true };
        }

        return { isPartial: false };
    });

    // A degraded SSR run is lifted by a client-side retry; until it finishes the
    // list counts as loading
    const isRecoveryFinished = ref(false);

    // A spinner instead of the empty state after an SSR refusal too: "no pages
    // yet" with a creation button is an assertion, and at that moment the list has
    // not been read
    const isLoadingPages = computed<boolean>(
        () =>
            pagesData.status.value === 'pending' ||
            (pagesData.data.value?.isPartial === true && !isRecoveryFinished.value)
    );

    // The refusal is reported by a watcher rather than at the call site: there are
    // two initiators — the first request on a client-side navigation into the
    // dashboard and the recovery after SSR — and on the client neither of them is
    // awaited. On the server the watch callbacks do not run, so the quiet
    // degradation stays quiet
    watch(pagesData.error, (error: unknown) => {
        if (error) {
            options.onLoadFailed();
        }
    });

    // Whether the page is still mounted at the moment the recovery starts: a
    // person has time to leave for the builder while the recovery waits for the
    // hydration to end
    let isPageAlive = true;
    let isRecoveryStarted = false;

    /**
     * Recovers the list after a degraded SSR run — exactly one request from the
     * client. On a refusal of the retry the previous list does not disappear: it
     * lives in the store, and `loadAllPages` leaves it alone on a refusal.
     */
    function recoverDegradedPages(): void {
        if (!isPageAlive || isRecoveryStarted || pagesData.data.value?.isPartial !== true) {
            return;
        }

        isRecoveryStarted = true;

        // Let go: there is nobody to wait for the result, and the watcher above
        // will report a refusal. No `void` here — the `no-void` rule of oxlint
        pagesData
            .refresh()
            .catch((error: unknown) => {
                console.warn('[BricksBuilder] Pages list recovery failed:', error);
            })
            .finally(() => {
                isRecoveryFinished.value = true;
            });
    }

    // `onScopeDispose` instead of `onUnmounted`: with the second argument it keeps
    // quiet outside a component, so the composable stays callable in unit tests
    onScopeDispose(() => {
        isPageAlive = false;
    }, true);

    // Not `onMounted`: while the hydration is running `refresh()` returns the
    // answer out of the payload without reaching the endpoint. `onNuxtReady` is
    // tied to the moment the retry really goes onto the network; on the server it
    // does nothing
    onNuxtReady(recoverDegradedPages);

    // The waiting happens on the server only: without it the markup would leave
    // with an empty list — exactly what this load fixes. On the client the waiting
    // would delay the move from the builder into the dashboard for the length of
    // the request, and instead of a spinner in the list a person would be looking
    // at a frozen builder
    if (import.meta.server) {
        await pagesData;
    }

    return {
        isLoadingPages,
    };
}
