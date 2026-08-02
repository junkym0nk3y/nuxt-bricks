/**
 * Типы для composables домена toolbar.
 */

import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue';
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';

// #region useToolbarPageSelector
/**
 * Опции composable useToolbarPageSelector.
 */
export interface IToolbarPageSelectorOptions {
    /** Сохранённые страницы — источник строк списка. */
    pages: MaybeRefOrGetter<TPublishedPageSummary[]>;
}

/**
 * Возвращаемое значение composable useToolbarPageSelector.
 */
export interface IUseToolbarPageSelectorReturn {
    isOpen: Ref<boolean>;
    searchQuery: Ref<string>;
    /** Поле поиска показывается, только когда список перестаёт помещаться целиком. */
    isSearchVisible: ComputedRef<boolean>;
    /** Строки после фильтрации по запросу. */
    filteredPages: ComputedRef<TPublishedPageSummary[]>;
    /** Запрос задан, но ни одна страница не подошла. */
    isEmptyResult: ComputedRef<boolean>;
    handleOpenChange: (isOpen: boolean) => void;
}
// #endregion
