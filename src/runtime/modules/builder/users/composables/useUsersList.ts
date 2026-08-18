// #region Imports
// Types
import type { IBricksUserSummary } from '../../../common/types/auth';
import type { IUsersFilterCounts, IUseUsersListReturn, TUsersFilter } from '../types/users';

// Utils
import { useDebounceFn } from '@vueuse/core';

// Vue
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
// #endregion

// #region Data
/** Задержка применения поискового запроса — та же, что в списке страниц. */
const SEARCH_DEBOUNCE_MS = 300;

const FILTER_PREDICATES: Record<TUsersFilter, (user: IBricksUserSummary) => boolean> = {
    all: () => true,
    active: (user) => user.isActive,
    inactive: (user) => !user.isActive,
};
// #endregion

/**
 * Вид списка учёток: поиск из шапки (с debounce) и сегмент-фильтр по
 * возможности входа.
 *
 * Отдельно от `useUsersData` по той же границе, что у списка страниц: там —
 * чтение с сервера и состояние раздела, здесь — то, как прочитанное показано.
 *
 * Поисковый запрос приходит извне, а не рождается здесь (в отличие от списка
 * страниц): поле поиска живёт в общей шапке дашборда, и у каждого раздела свой
 * запрос — иначе переключение раздела тащило бы в учётки строку, набранную для
 * страниц, и список выглядел бы пустым.
 *
 * Фильтрация клиентская: список учёток заведомо мал (это команда, а не
 * содержимое сайта), и серверный поиск добавил бы запрос на каждую букву.
 *
 * @param users - Реактивный список учёток.
 * @param searchQuery - Запрос из шапки дашборда.
 * @returns Состояние фильтра и отфильтрованный список.
 */
export function useUsersList(
    users: Ref<IBricksUserSummary[]> | ComputedRef<IBricksUserSummary[]>,
    searchQuery: Ref<string> | ComputedRef<string>
): IUseUsersListReturn {
    // #region Data
    // Начальное значение берётся из запроса, а не пустое: раздел монтируется
    // заново при каждом возврате в него, а debounce срабатывает только на
    // ИЗМЕНЕНИЕ — с пустым начальным значением человек возвращался бы к своему
    // запросу в поле поиска и к неотфильтрованному списку под ним
    const debouncedSearchQuery = ref(searchQuery.value);
    const activeFilter = ref<TUsersFilter>('all');

    const applySearchQuery = useDebounceFn((value: string) => {
        debouncedSearchQuery.value = value;
    }, SEARCH_DEBOUNCE_MS);
    // #endregion

    // #region Computed
    /**
     * Учётки, прошедшие поиск (до сегмент-фильтра) — от них же считаются
     * счётчики фильтров, иначе «Активные · 4» обещали бы четыре строки, которых
     * поиск на экран не пустит.
     */
    const searchedUsers = computed<IBricksUserSummary[]>(() => {
        const query = debouncedSearchQuery.value.trim().toLowerCase();

        if (!query) {
            return users.value;
        }

        // Логин ищется вместе с именем: человека находят и по подписи, и по тому,
        // чем он входит, а у учётки без отображаемого имени логин — единственное,
        // что о ней вообще известно
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
