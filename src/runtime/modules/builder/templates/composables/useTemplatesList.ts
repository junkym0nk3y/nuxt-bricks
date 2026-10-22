// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { IUseTemplatesListReturn } from '../types/templates';

// Utils
import { useDebounceFn } from '@vueuse/core';

// Vue
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

// Constants
import { DASHBOARD_LIST_SEARCH_DEBOUNCE_MS } from '../../core/constants/dashboardSearch';
// #endregion

/**
 * The view of the template grid: the search from the header (debounced).
 *
 * Kept apart from `useTemplatesData` along the same border as in the page and account
 * lists: there — the reading from the server and the state of the section, here — the
 * way what has been read is shown.
 *
 * The filtering is client-side: the template list is knowingly small (these are the
 * groundwork of a team, not the content of a site), and a server-side search would add
 * a request per keystroke.
 *
 * @param templates - The reactive list of summaries.
 * @param searchQuery - The query from the dashboard header.
 * @returns The filtered list and whether the search matched nothing.
 */
export function useTemplatesList(
    templates: Ref<TBricksTemplateSummary[]> | ComputedRef<TBricksTemplateSummary[]>,
    searchQuery: Ref<string> | ComputedRef<string>
): IUseTemplatesListReturn {
    // #region Data
    // The initial value is taken from the query rather than left empty: the section is
    // mounted anew on every return into it, while the debounce fires on a CHANGE only —
    // with an empty initial value a person would come back to their query in the search
    // field and to an unfiltered grid under it
    const debouncedSearchQuery = ref(searchQuery.value);

    const applySearchQuery = useDebounceFn((value: string) => {
        debouncedSearchQuery.value = value;
    }, DASHBOARD_LIST_SEARCH_DEBOUNCE_MS);
    // #endregion

    // #region Computed
    const filteredTemplates = computed<TBricksTemplateSummary[]>(() => {
        const query = debouncedSearchQuery.value.trim().toLowerCase();

        if (!query) {
            return templates.value;
        }

        // The description is searched along with the name: templates are told apart by
        // what they are assembled from ("a cover with a slider") rather than by their
        // caption alone
        return templates.value.filter((template) =>
            [template.name, template.description]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query)
        );
    });

    const isSearchEmpty = computed<boolean>(
        () => debouncedSearchQuery.value.trim() !== '' && filteredTemplates.value.length === 0
    );
    // #endregion

    // #region Lifecycle
    watch(searchQuery, (value) => {
        applySearchQuery(value);
    });
    // #endregion

    return { filteredTemplates, isSearchEmpty };
}
