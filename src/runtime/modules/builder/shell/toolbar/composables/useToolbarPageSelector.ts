// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';
import type {
    IToolbarPageSelectorOptions,
    IUseToolbarPageSelectorReturn,
} from '../types/composables';

// Vue
import { computed, ref, toValue } from 'vue';
// #endregion

/**
 * Порог показа поля поиска. Ровно та длина, на которой список перестаёт
 * помещаться в попап целиком: до неё поле было бы лишним элементом над списком,
 * который и так виден весь.
 */
const SEARCH_VISIBLE_FROM_PAGES = 7;

/**
 * Состояние селектора страниц в тулбаре: открытость попапа, строка поиска и
 * отфильтрованный список.
 *
 * Данными не владеет — страницы приходят снаружи (composition root читает их из
 * стора публикации), здесь только то, что живёт ровно столько же, сколько
 * открытый попап.
 *
 * @param options - Источник списка страниц.
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
     * Запрос, который реально применяется. Скрытое поле не фильтрует: список мог
     * сократиться (страницу удалили в другой вкладке) уже после набора, и тогда
     * пользователь остался бы с урезанным списком и без поля, чтобы это увидеть.
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

        // По названию и по адресу сразу: страницу помнят то так, то так
        return pages.filter((page) =>
            `${page.title ?? ''} ${page.pagename}`.toLowerCase().includes(query)
        );
    });

    const isEmptyResult = computed<boolean>(
        () => Boolean(effectiveQuery.value) && filteredPages.value.length === 0
    );
    // #endregion

    // #region Methods
    /**
     * Открывает и закрывает попап. Закрытие сбрасывает запрос: следующее открытие
     * должно показывать весь список, а не хвост прошлого поиска.
     *
     * @param nextOpen - Новое состояние попапа.
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
