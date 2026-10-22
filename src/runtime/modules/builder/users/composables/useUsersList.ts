// #region Imports
// Types
import type { IBricksUserSummary } from '../../../common/types/auth';
import type { IUsersFilterCounts, IUseUsersListReturn, TUsersFilter } from '../types/users';

// Utils
import { useDebounceFn } from '@vueuse/core';

// Vue
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

// Constants
import { DASHBOARD_LIST_SEARCH_DEBOUNCE_MS } from '../../core/constants/dashboardSearch';
// #endregion

// #region Data
const FILTER_PREDICATES: Record<TUsersFilter, (user: IBricksUserSummary) => boolean> = {
    all: () => true,
    active: (user) => user.isActive,
    inactive: (user) => !user.isActive,
};
// #endregion

/**
 * The view of the account list: the search from the header (debounced) and the
 * segment filter by the ability to sign in.
 *
 * Kept apart from `useUsersData` along the same border as in the page list: there —
 * the reading from the server and the state of the section, here — the way what has
 * been read is shown.
 *
 * The search query arrives from outside instead of being born here (unlike in the
 * page list): the search field lives in the shared header of the dashboard, and every
 * section has a query of its own — otherwise switching sections would drag into the
 * accounts a string typed for the pages, and the list would look empty.
 *
 * The filtering is client-side: the account list is knowingly small (this is a team,
 * not the content of a site), and a server-side search would add a request per
 * keystroke.
 *
 * @param users - The reactive list of accounts.
 * @param searchQuery - The query from the dashboard header.
 * @returns The state of the filter and the filtered list.
 */
export function useUsersList(
    users: Ref<IBricksUserSummary[]> | ComputedRef<IBricksUserSummary[]>,
    searchQuery: Ref<string> | ComputedRef<string>
): IUseUsersListReturn {
    // #region Data
    // The initial value is taken from the query rather than left empty: the section
    // is mounted anew on every return into it, while the debounce fires on a CHANGE
    // only — with an empty initial value a person would come back to their query in
    // the search field and to an unfiltered list under it
    const debouncedSearchQuery = ref(searchQuery.value);
    const activeFilter = ref<TUsersFilter>('all');

    const applySearchQuery = useDebounceFn((value: string) => {
        debouncedSearchQuery.value = value;
    }, DASHBOARD_LIST_SEARCH_DEBOUNCE_MS);
    // #endregion

    // #region Computed
    /**
     * The accounts that passed the search (before the segment filter) — the filter
     * counters are counted from them too, otherwise "Active · 4" would promise four
     * rows the search will not let onto the screen.
     */
    const searchedUsers = computed<IBricksUserSummary[]>(() => {
        const query = debouncedSearchQuery.value.trim().toLowerCase();

        if (!query) {
            return users.value;
        }

        // The username is searched along with the name: a person is found both by
        // their caption and by what they sign in with, and for an account with no
        // display name the username is the only thing known about it at all
        return users.value.filter((user) =>
            [user.displayName, user.username]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query)
        );
    });

    const filterCounts = computed<IUsersFilterCounts>(() => ({
        all: searchedUsers.value.length,
        active: searchedUsers.value.filter(FILTER_PREDICATES.active).length,
        inactive: searchedUsers.value.filter(FILTER_PREDICATES.inactive).length,
    }));

    const filteredUsers = computed<IBricksUserSummary[]>(() =>
        searchedUsers.value.filter(FILTER_PREDICATES[activeFilter.value])
    );
    // #endregion

    // #region Lifecycle
    watch(searchQuery, (value) => {
        applySearchQuery(value);
    });
    // #endregion

    return { activeFilter, filterCounts, filteredUsers };
}
