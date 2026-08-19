// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { IUseTemplatesListReturn } from '../types/templates';

// Utils
import { useDebounceFn } from '@vueuse/core';

// Vue
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
// #endregion

// #region Data
/** Задержка применения поискового запроса — та же, что в списках страниц и учёток. */
const SEARCH_DEBOUNCE_MS = 300;
// #endregion

/**
 * Вид сетки шаблонов: поиск из шапки дашборда (с debounce).
 *
 * Отдельно от `useTemplatesData` по той же границе, что у списков страниц и
 * учёток: там — чтение с сервера и состояние раздела, здесь — то, как
 * прочитанное показано.
 *
 * Фильтрация клиентская: шаблонов заведомо немного (это заготовки команды, а не
 * содержимое сайта), и серверный поиск добавил бы запрос на каждую букву.
 *
 * @param templates - Реактивный список сводок.
 * @param searchQuery - Запрос из шапки дашборда.
 * @returns Отфильтрованный список и признак «поиск ничего не нашёл».
 */
export function useTemplatesList(
    templates: Ref<TBricksTemplateSummary[]> | ComputedRef<TBricksTemplateSummary[]>,
    searchQuery: Ref<string> | ComputedRef<string>
): IUseTemplatesListReturn {
    // #region Data
    // Начальное значение — из запроса, а не пустое: раздел монтируется заново при
    // каждом возврате в него, а debounce срабатывает только на ИЗМЕНЕНИЕ — иначе
    // человек возвращался бы к своему запросу в поле и неотфильтрованной сетке
    const debouncedSearchQuery = ref(searchQuery.value);

    const applySearchQuery = useDebounceFn((value: string) => {
        debouncedSearchQuery.value = value;
    }, SEARCH_DEBOUNCE_MS);
    // #endregion

    // #region Computed
    const filteredTemplates = computed<TBricksTemplateSummary[]>(() => {
        const query = debouncedSearchQuery.value.trim().toLowerCase();

        if (!query) {
            return templates.value;
        }

        // Описание ищется вместе с именем: шаблоны различают по тому, из чего они
        // собраны («обложка со слайдером»), а не только по подписи
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
