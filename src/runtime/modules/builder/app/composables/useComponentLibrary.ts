// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickManifestEntry, IBricksManifest } from '../../../common/types/brickManifest';
import type { ISkippedBrick } from '../../core/types/componentLibrary';
import type { TCachedModal } from '../../core/types/modals';
import type { IComponentLibraryData, IUseComponentLibraryReturn } from '../types/composables';

// Utils
import { translateBricksKey } from '../../../common/utils/globalI18n';
import { resolveBlockSeedProps } from '../../../layouts-blocks/registry';
import { toComponentLibraryItem } from '../utils/componentLibraryItems';
import {
    createComponentManifestDeadlineError,
    isComponentManifestDeadlineError,
} from '../utils/componentLibraryPolicy';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed, onScopeDispose } from 'vue';

// Nuxt
import { onNuxtReady, useAsyncData, useState } from '#imports';

// Pinia
import { useComponentsStore } from '../../core/stores/components';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBrickImports } from '../../../common/composables/useBrickImports';
import { useBrickMetadata } from '../../core/composables/useBrickMetadata';
import { useComponentEditorMetadata } from '../../core/composables/useComponentEditorMetadata';
import { replaceModalsCache } from '../../core/composables/useModalOptions';

// Constants
import { LAYOUT_COMPONENTS } from '../../core/constants/layoutComponents';
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';
// #endregion

/** The brick category that lands in the modal selector of the properties panel. */
const MODAL_CATEGORY = 'Modal';

/**
 * Bounds the waiting of the manifest on SSR.
 *
 * The deadline covers **the request alone**: the page of the editor is awaited by
 * `setup` (`useBuilderPage`), while on the server the transport ceiling is inert —
 * a relative URL goes out as an internal Nitro call, which does not listen to an
 * `AbortSignal`. Wrapping the whole handler is not allowed: it also holds the
 * import of the brick modules, and a shared deadline would hand them whatever is
 * left of the budget of the request — a quick answer of the endpoint and slow
 * imports would zero the library out whole, the layout components included. A hung
 * import is not bounded by this deadline — that calls for a budget of its own,
 * honestly named, and there is none yet.
 *
 * On the client the transport ceiling works by itself, no deadline is needed there.
 *
 * @param request - The promise of the manifest request.
 * @returns The answer of the components endpoint.
 */
function fetchManifestWithinDeadline(request: Promise<IBricksManifest>): Promise<IBricksManifest> {
    if (!import.meta.server) {
        return request;
    }

    const deadlineMs = BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS;

    return withPromiseDeadline(request, deadlineMs, () =>
        createComponentManifestDeadlineError(deadlineMs)
    );
}

/**
 * Collects the modal entries for the properties selector out of the same manifest
 * answer. A missing loader is not filtered out here: the selector needs the name
 * and the path alone, while a drift between the build and the manifest is what the
 * library shows.
 *
 * @param bricks - The entries of the brick component manifest.
 * @returns The modal entries for the cache.
 */
function collectModalEntries(bricks: IBrickManifestEntry[]): TCachedModal[] {
    return bricks
        .filter((brick) => brick.category === MODAL_CATEGORY)
        .map((brick) => ({ name: brick.name, brickPath: brick.brickPath }));
}

/**
 * Loads the component library: the manifest entries out of the backend (their
 * metadata is parsed at build time already) plus the layout components.
 *
 * The same answer fills in the modal cache of the properties panel and the
 * metadata index the properties panel, the slots and the inline editing live off:
 * there is one manifest, and a second request for it would mean two independent
 * caches of one answer, each with a fate of its own under a refusal.
 *
 * A failed SSR run is recovered with one request from the client: without it a
 * refusal on the server would leave the sidebar empty until a full reload of the
 * page, and the reload would go into the same SSR again.
 *
 * @returns The list of the components, the sign of a refused load and the retry.
 */
export async function useComponentLibrary(): Promise<IUseComponentLibraryReturn> {
    const { hasBrickModule } = useBrickImports();
    const { replaceBrickMetadata } = useBrickMetadata();
    const { resolveComponentEditorMetadata } = useComponentEditorMetadata();
    const componentsStore = useComponentsStore();

    // The snapshot of the last successful load. Needed because of the behavior of
    // `useAsyncData`: on a refusal it resets `data` to the default (`asyncData.js`:
    // `data.value = unref(options.default())`), that is, a failed retry would take
    // the already loaded bricks away from a person — along with the chance to go on
    // working with what worked anyway.
    //
    // State at the level of the application rather than a local `ref`: the cache of
    // a keyed request is cleared when the last consumer unmounts (`purgeCachedData`),
    // so a snapshot inside the page instance would live shorter than the modal cache
    // built out of the same answer — on a second visit with the endpoint refusing,
    // the modal selector would show entries that are no longer in the library. It is
    // set up before the `await`: after it the composable is outside the Nuxt context.
    const lastLoadedData = useState<IComponentLibraryData | null>(
        'bricks-components-last-loaded',
        () => null
    );

    // The promise of `useAsyncData` is deliberately not awaited here: before the
    // await the recovery after an SSR refusal has to be registered synchronously,
    // and after it the active scope is lost (the same limitation the whole wiring of
    // `useBuilderPage` goes before its single await because of)
    const componentLibrary = useAsyncData<IComponentLibraryData>('bricks-components', async () => {
        const { apiFetcher } = useApiClient();
        let response: IBricksManifest;

        try {
            response = await fetchManifestWithinDeadline(
                apiFetcher<IBricksManifest>('/api/bricks/components')
            );
        } catch (error: unknown) {
            // Every other refusal goes outwards: the interface needs `error` as
            // the sign of a refusal, and a retry does not always mend them
            if (!isComponentManifestDeadlineError(error)) {
                throw error;
            }

            console.warn(
                '[BricksBuilder] Components manifest deadline exceeded — layout blocks only',
                error
            );

            // Rejecting the load is not allowed: the error would land in
            // `payload._errors`, and on a hydration carrying an error Nuxt skips
            // the first request — the sidebar would stay empty until a full reload,
            // and that one would go into the SSR again and would wait out the
            // deadline again. The incompleteness marker is there so that a degraded
            // answer does not settle in the payload as a complete one
            return {
                isPartial: true,
                bricks: [],
            };
        }

        return {
            isPartial: false,
            bricks: response?.bricks || [],
        };
    });

    /**
     * Commits the result of a successful load: the snapshot of the answer, the modal
     * cache of the properties panel and the metadata index. Both caches are updated
     * here rather than inside the handler: on hydration the handler does not run at
     * all (the answer arrives ready in the payload), and they would stay empty on the
     * client — exactly where they are used. They are written out of one value so that
     * the list, the modal options and the properties of the selected component cannot
     * drift apart.
     *
     * A degraded answer is not committed: the snapshot of "the last successful load"
     * would become a list of the layout blocks alone, and the zeroed caches would take
     * away the modal options and the properties that came with the previous successful
     * load.
     */
    function commitLoadedData(): void {
        const data = componentLibrary.data.value;

        if (!data || data.isPartial) {
            return;
        }

        lastLoadedData.value = data;
        // Before the metadata: the modal options are read by
        // `brickValuesToProperties`, which is what fills the properties panel out of
        // that same index
        replaceModalsCache(collectModalEntries(data.bricks));
        replaceBrickMetadata(data.bricks);
        refreshSelectedComponentMetadata();
    }

    /**
     * Reassembles the properties of the component already selected.
     *
     * The properties panel is filled at the moment of the selection while the
     * metadata arrives in the manifest: if that never came, the panel stayed empty,
     * and without this step a successful retry would change nothing in it — a person
     * would have to select the component anew. The other side of the same step: a
     * brick that has disappeared from the manifest clears the panel rather than
     * leaving the properties of the previous load behind.
     */
    function refreshSelectedComponentMetadata(): void {
        const selected = componentsStore.selectedComponentData;

        if (!selected) {
            return;
        }

        const { properties, description } = resolveComponentEditorMetadata(selected.component);

        componentsStore.setSelectedComponentMetadata(selected.id, properties, description);
    }

    // The answer the interface lives off: the fresh complete one, otherwise the
    // snapshot of the last successful load, otherwise the degraded one.
    //
    // A degraded answer gives way to the snapshot: it holds the layout blocks alone
    // and would otherwise cover the complete list loaded before the builder was
    // left. The opposite order ("the snapshot always wins") is wrong — the snapshot
    // would then cover a fresh complete answer.
    //
    // One source for both the list and the skips: otherwise the components of one
    // load and the warning of another would end up on the screen together
    const effectiveLibraryData = computed<IComponentLibraryData | null>(() => {
        const data = componentLibrary.data.value;

        if (data && !data.isPartial) {
            return data;
        }

        return lastLoadedData.value ?? data ?? null;
    });

    // The entries the build holds a loader for. Checked on the client rather than in
    // the handler: the map of the loaders is unrolled into the bundle, and the
    // authoritative one is exactly the one that made it into the current build
    const loadableBricks = computed<IBrickManifestEntry[]>(() =>
        (effectiveLibraryData.value?.bricks ?? []).filter((brick) =>
            hasBrickModule(brick.brickPath)
        )
    );

    // Starting content of a block is materialized here, at the moment the card is
    // built, and not stored in the definition: the definition keeps the structure
    // language-neutral, because its defaults travel into the page schema on the first
    // save and turn into the content of the person. Recomputed on a language switch,
    // so a block dragged out afterwards starts in the new language while the ones
    // already on the canvas keep the text they were created with.
    //
    // The translator comes from the shared helper rather than `useI18n()`: this
    // composable is awaited by its callers and is reached from outside a setup context
    // as well, where `useI18n` refuses to run.
    const layoutComponents = computed<IComponentLibraryItem[]>(() =>
        LAYOUT_COMPONENTS.map((item) => {
            const seedProps = resolveBlockSeedProps(item.name, translateBricksKey);

            if (!Object.keys(seedProps).length) {
                return item;
            }

            return { ...item, defaultProps: { ...item.defaultProps, ...seedProps } };
        })
    );

    // The layout blocks need no manifest: a refusal of the endpoint must not take
    // those away from a person as well — otherwise nothing at all can be put onto
    // the canvas
    const componentLibraryList = computed<IComponentLibraryItem[]>(() => [
        ...layoutComponents.value,
        ...loadableBricks.value.map(toComponentLibraryItem),
    ]);

    // A skipped brick does not count as a refused load: the answer of the endpoint
    // arrived and was parsed, and a retry will not mend such a skip (a finished
    // build gains no loaders). Hence a sign of its own, living next to the refusal
    // rather than instead of it: in the sidebar both may be visible at once
    const skippedBricks = computed<ISkippedBrick[]>(() =>
        (effectiveLibraryData.value?.bricks ?? [])
            .filter((brick) => !hasBrickModule(brick.brickPath))
            .map((brick) => ({ name: brick.name, brickPath: brick.brickPath }))
    );

    // A refusal differs from "the library is empty": the list is non-empty under a
    // refusal too (the layout blocks), which is why the sign has to be a field of its
    // own. A degradation is a refusal for the interface as well: the toast and the
    // retry block in the sidebar are needed when the manifest missed the deadline
    // too. The sign will lower itself should the recovery below manage to bring the
    // library in
    const isComponentLibraryLoadFailed = computed<boolean>(
        () =>
            componentLibrary.error.value !== null || componentLibrary.data.value?.isPartial === true
    );

    /**
     * Retries the load of the manifest. Neither during a retry nor after a failed one
     * does the previous list disappear: cards vanishing would read as the loss of the
     * library, although nothing prevents work with the one already loaded.
     *
     * @returns The load succeeded.
     */
    async function refreshComponentLibrary(): Promise<boolean> {
        await componentLibrary.refresh();

        if (componentLibrary.error.value !== null) {
            return false;
        }

        commitLoadedData();

        return true;
    }

    // The page is still mounted as of the start of the recovery. The check cancels
    // no request already in flight — it merely starts no new one: a person has time
    // to leave while the recovery waits for the end of the hydration. A request
    // already started is thrown away by Nuxt itself after the departure: unmounting
    // the last consumer clears the entry (`clearNuxtDataByKey` out of
    // `purgeCachedData`) along with the slot in `_asyncDataPromises`, and the
    // continuation of a displaced promise leaves without applying anything. No harm
    // in it, but no point either
    let isPageAlive = true;
    let isRecoveryStarted = false;

    /**
     * Recovers the library after a failed SSR run: one request from the client,
     * where neither the SSR deadline nor the inert transport ceiling is there any
     * more.
     *
     * Two outcomes are retried: a degradation on the deadline and an ordinary refusal
     * of the endpoint. For the second one the retry is the only chance: the SSR error
     * lies in `payload._errors`, and on a hydration carrying an error Nuxt skips the
     * first request, that is, the sidebar would stay empty until a full reload of the
     * page.
     *
     * Exactly one attempt. Today nothing but the agreement obliges that:
     * `onNuxtReady` calls the callback once, so there is no loop even without the
     * flag. The flag guards against a second caller — and one will appear as soon as
     * the retry is wanted on the return of the network or on a change of the tab
     * visibility as well. After that a retry is by hand only, with the button of the
     * sidebar.
     */
    function recoverFailedLibrary(): void {
        const isRecoverable =
            componentLibrary.data.value?.isPartial === true ||
            componentLibrary.error.value !== null;

        if (!isPageAlive || isRecoveryStarted || !isRecoverable) {
            return;
        }

        isRecoveryStarted = true;

        // Let go: there is nobody to await the result, and the outcome is visible
        // in the state of the library. No `void` is written — the `no-void` rule in
        // oxlint
        refreshComponentLibrary().catch((error: unknown) => {
            console.warn('[BricksBuilder] Components library recovery failed:', error);
        });
    }

    // `onScopeDispose` instead of `onUnmounted`: with the second argument it stays
    // silent outside a component, so the composable remains callable in unit tests
    // without a Vue warning about a lost hook
    onScopeDispose(() => {
        isPageAlive = false;
    }, true);

    // Not `onMounted`: the mounted hooks manage to run before Nuxt lowers
    // `isHydrating`, and while the hydration is going on `refresh()` returns the same
    // answer out of the payload without addressing the endpoint
    // (`getDefaultCachedData`). `onNuxtReady` is tied to `app:suspense:resolve`, that
    // is, to the moment a retry really goes out into the network. On the server it
    // does nothing.
    //
    // The price: the callback goes through `requestIdleCallback` with no waiting
    // ceiling, so under continuous load the recovery will be put off. That is
    // accepted: the library shows the layout blocks already, and loading the rest of
    // it is background work rather than urgent
    onNuxtReady(recoverFailedLibrary);

    await componentLibrary;

    commitLoadedData();

    return {
        componentLibraryList,
        skippedBricks,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading: computed<boolean>(
            () => componentLibrary.status.value === 'pending'
        ),
        refreshComponentLibrary,
    };
}
