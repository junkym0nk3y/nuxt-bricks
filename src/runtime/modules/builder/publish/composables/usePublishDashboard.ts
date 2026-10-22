// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { TPublishPagesFilter, IPublishPagesFilterCounts } from '../types/dashboard';

// Utils
import { getPageAddressKey, toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';

// Utils
import { useDebounceFn } from '@vueuse/core';

// Constants
import { DASHBOARD_LIST_SEARCH_DEBOUNCE_MS } from '../../core/constants/dashboardSearch';
// #endregion

// #region Data
const FILTER_PREDICATES: Record<TPublishPagesFilter, (page: TPublishedPageSummary) => boolean> = {
    all: () => true,
    published: (page) => page.published,
    drafts: (page) => !page.published,
};
// #endregion

/**
 * The state of the pages dashboard: the search from the header (debounced) and the
 * segment filter of the list. The filtering is client-side — over `title`,
 * `pagename` and `description`.
 *
 * @param pages - The reactive page list (from the publish store).
 */
export function usePublishDashboard(
    pages: Ref<TPublishedPageSummary[]> | ComputedRef<TPublishedPageSummary[]>
) {
    // #region Data
    const searchQuery = ref('');
    const debouncedSearchQuery = ref('');
    const activeFilter = ref<TPublishPagesFilter>('all');

    const applySearchQuery = useDebounceFn((value: string) => {
        debouncedSearchQuery.value = value;
    }, DASHBOARD_LIST_SEARCH_DEBOUNCE_MS);
    // #endregion

    // #region Computed
    /**
     * The pages that passed the search (before the segment filter) — the filter
     * counters are counted over them as well.
     */
    const searchedPages = computed<TPublishedPageSummary[]>(() => {
        const query = debouncedSearchQuery.value.trim().toLowerCase();
        if (!query) {
            return pages.value;
        }

        return pages.value.filter((page) => {
            // The whole address rather than the `pagename` alone: a row of the
            // list shows `/news/post`, and the query `news` is obliged to find it
            // — once pages could share a name, the prefix became the telling part
            // of an address
            const haystack = [
                page.title,
                getPageAddressKey(toPageAddress(page.pagename, page.urlPrefix)),
                page.description,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(query);
        });
    });

    const filterCounts = computed<IPublishPagesFilterCounts>(() => ({
        all: searchedPages.value.length,
        published: searchedPages.value.filter(FILTER_PREDICATES.published).length,
        drafts: searchedPages.value.filter(FILTER_PREDICATES.drafts).length,
    }));

    const filteredPages = computed<TPublishedPageSummary[]>(() =>
        searchedPages.value.filter(FILTER_PREDICATES[activeFilter.value])
    );

    const hasAnyPages = computed<boolean>(() => pages.value.length > 0);
    // #endregion

    // #region Lifecycle
    watch(searchQuery, (value) => {
        applySearchQuery(value);
    });
    // #endregion

    return {
        searchQuery,
        activeFilter,
        filterCounts,
        filteredPages,
        hasAnyPages,
    };
}
