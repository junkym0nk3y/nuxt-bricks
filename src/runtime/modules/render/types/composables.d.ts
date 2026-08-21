import type { ComputedRef, Ref } from 'vue';

import type { IPublishedPage } from '../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../common/types/pageAddress';

// #region useRendererDataSources
/**
 * Options of the useRendererDataSources composable.
 */
export interface IRendererDataSourcesOptions {
    /** Data of the current page (live preview or the middleware payload). */
    page: ComputedRef<IPublishedPage | null>;
    /**
     * Page address: part of the run's `useAsyncData` key. The address rather than
     * the name — otherwise pages of the same name under different prefixes would
     * share the run cache.
     */
    address: IBricksPageAddress;
    isPreview: boolean;
}

/**
 * Result of a data sources run in the `useAsyncData` cache: the props themselves
 * plus the mark that the run is incomplete.
 *
 * The mark sits next to the data rather than in a state of its own because in
 * the payload it has to arrive together with them: let those two values drift
 * apart and the client would either repeat a full run or take an incomplete one
 * for a complete one.
 */
export interface IRendererDataSourcesData {
    /**
     * Snapshot of the merged props per component. The key is `component.id` from
     * the schema, hence a `Map` as the container: with `id === '__proto__'` an
     * ordinary object would take the props into the global prototype.
     */
    props: Map<string, Record<string, unknown>>;
    /**
     * The run was abandoned on the total deadline: some of the sources did not
     * answer, and their components stayed on fallback props.
     *
     * The meaning is narrow — "the run was deliberately cut off by time and calls
     * for one client-side attempt". Exceeding the request-count budget, the
     * failure of a single source and an error importing a brick file do not
     * belong here: a repeat will not fix them, and on every published page it
     * would cost a superfluous run.
     */
    isPartial: boolean;
}

/**
 * Return value of the useRendererDataSources composable.
 */
export interface IRendererDataSources {
    /** Snapshot of the merged props for all components, data sources included. */
    resolvedProps: ComputedRef<Map<string, Record<string, unknown>>>;
    /** Restarts the data sources run (on a live schema update, for example). */
    refreshDataSources: () => Promise<void>;
    /** Promise of the first run — await it in a top-level setup (SSR blocking). */
    ready: Promise<unknown>;
}
// #endregion

// #region useBricksDataSources
/** Response cache of one run: identical (method + url) requests run once. */
export type TDataSourceRequestCache = Map<string, Promise<unknown>>;
// #endregion

// #region useRendererPreviewSync
/**
 * Options of the useRendererPreviewSync composable.
 */
export interface IRendererPreviewSyncOptions {
    /**
     * Page address: the token that matches the snapshot in the slot and the
     * messages of the sync channel.
     */
    address: IBricksPageAddress;
    isPreview: boolean;
    /**
     * Id of the saved version from `?version=` (null — a preview of the current
     * state). A version tab shows a state out of the history: live sync with the
     * builder and the localStorage snapshot are switched off for it.
     */
    previewVersionId: number | null;
    /** Page data from the middleware payload (the saved page). */
    middlewarePageData: Ref<IPublishedPage | null>;
    /** Live preview data: filled from localStorage and BroadcastChannel. */
    livePreviewData: Ref<IPublishedPage | null>;
    /** Resulting page data (live preview or the middleware payload). */
    page: ComputedRef<IPublishedPage | null>;
    /** Restart of the data sources when the page data changes. */
    refreshDataSources: () => void;
}

/**
 * Preview device breakpoint: the width threshold and the icon for the banner.
 */
export interface IPreviewDeviceBreakpoint {
    name: string;
    minWidth: number;
    icon: string;
}

/**
 * Return value of the useRendererPreviewSync composable.
 */
export interface IRendererPreviewSync {
    /** Device breakpoint matching the current window width (preview banner). */
    currentDevice: ComputedRef<IPreviewDeviceBreakpoint>;
    /** Text of the current window resolution (for the preview banner). */
    resolutionText: ComputedRef<string>;
    /** Closes the preview window and clears the stored preview data. */
    closePreview: () => void;
}
// #endregion
