/**
 * Types for the composables of the toolbar domain.
 */

import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue';
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';

// #region useToolbarPageSelector
/**
 * Options of the `useToolbarPageSelector` composable.
 */
export interface IToolbarPageSelectorOptions {
    /** Saved pages — the source of the list rows */
    pages: MaybeRefOrGetter<TPublishedPageSummary[]>;
}

/**
 * Return value of the `useToolbarPageSelector` composable.
 */
export interface IUseToolbarPageSelectorReturn {
    isOpen: Ref<boolean>;
    searchQuery: Ref<string>;
    /** The search field shows up only once the list stops fitting whole */
    isSearchVisible: ComputedRef<boolean>;
    /** Rows left after filtering by the query */
    filteredPages: ComputedRef<TPublishedPageSummary[]>;
    /** A query is set, and no page matched it */
    isEmptyResult: ComputedRef<boolean>;
    handleOpenChange: (isOpen: boolean) => void;
}
// #endregion
