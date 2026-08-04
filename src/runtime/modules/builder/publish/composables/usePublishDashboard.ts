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
// #endregion

// #region Data
const SEARCH_DEBOUNCE_MS = 300;

const FILTER_PREDICATES: Record<TPublishPagesFilter, (page: TPublishedPageSummary) => boolean> = {
    all: () => true,
    published: (page) => page.published,
    drafts: (page) => !page.published,
};
// #endregion

/**
 * Состояние дашборда страниц: поиск из шапки (с debounce) и сегмент-фильтр списка.
 * Фильтрация клиентская — по `title`, `pagename` и `description`.
 *
 * @param pages - Реактивный список страниц (из publish-store).
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
    }, SEARCH_DEBOUNCE_MS);
    // #endregion

    // #region Computed
    /**
     * Страницы, прошедшие поиск (до сегмент-фильтра) —
     * от них же считаются счётчики фильтров.
     */
    const searchedPages = computed<TPublishedPageSummary[]>(() => {
        const query = debouncedSearchQuery.value.trim().toLowerCase();
        if (!query) {
            return pages.value;
        }

        return pages.value.filter((page) => {
            // Адрес целиком, а не один `pagename`: строка списка показывает
            // `/news/post`, и запрос `news` обязан её находить — после появления
            // одноимённых страниц префикс и есть различающая часть адреса
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
