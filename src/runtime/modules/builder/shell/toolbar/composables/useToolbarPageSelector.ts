// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';
import type {
    IToolbarPageSelectorOptions,
    IUseToolbarPageSelectorReturn,
} from '../types/composables';

// Utils
import { getPageAddressKey, toPageAddress } from '../../../../common/utils/bricks/pageAddress';

// Vue
import { computed, ref, toValue } from 'vue';
// #endregion

/**
 * Threshold at which the search field appears. Roughly the length past which the list
 * stops fitting into the popup: below it the field would be one extra element above a
 * list that scrolling alone still covers.
 */
const SEARCH_VISIBLE_FROM_PAGES = 7;

/**
 * State of the page selector in the toolbar: whether the popup is open, the search
 * query and the filtered list.
 *
 * It owns no data — the pages arrive from the outside (the composition root reads
 * them from the publish store), and what lives here lives exactly as long as the
 * open popup does.
 *
 * @param options - Source of the page list.
 */
export function useToolbarPageSelector(
    options: IToolbarPageSelectorOptions
): IUseToolbarPageSelectorReturn {
    // #region Data
    const isOpen = ref(false);
    const searchQuery = ref('');
    // #endregion

    // #region Computed
    const isSearchVisible = computed<boolean>(
        () => toValue(options.pages).length >= SEARCH_VISIBLE_FROM_PAGES
    );

    /**
     * The query actually applied. A hidden field filters nothing: the list may have
     * shrunk (a page deleted in another tab) after the query was typed, and the user
     * would then be left with a cut-down list and no field to see why.
     */
    const effectiveQuery = computed<string>(() =>
        isSearchVisible.value ? searchQuery.value.trim().toLowerCase() : ''
    );

    const filteredPages = computed<TPublishedPageSummary[]>(() => {
        const pages = toValue(options.pages);
        const query = effectiveQuery.value;

        if (!query) {
            return pages;
        }

        // By title and by address at once: a page is remembered one way or the other.
        // The address is the full one (`blog/post`), so a query over the prefix finds
        // its pages too, and among same-named ones the difference shows in the match
        // itself
        return pages.filter((page) =>
            `${page.title ?? ''} ${getPageAddressKey(toPageAddress(page.pagename, page.urlPrefix))}`
                .toLowerCase()
                .includes(query)
        );
    });

    const isEmptyResult = computed<boolean>(
        () => Boolean(effectiveQuery.value) && filteredPages.value.length === 0
    );
    // #endregion

    // #region Methods
    /**
     * Opens and closes the popup. Closing resets the query: the next opening has to
     * show the whole list, not the tail of the previous search.
     *
     * @param nextOpen - New state of the popup.
     */
    function handleOpenChange(nextOpen: boolean): void {
        isOpen.value = nextOpen;

        if (!nextOpen) {
            searchQuery.value = '';
        }
    }
    // #endregion

    return {
        isOpen,
        searchQuery,
        isSearchVisible,
        filteredPages,
        isEmptyResult,
        handleOpenChange,
    };
}
