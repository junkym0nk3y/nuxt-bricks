// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Vue
import { ref } from 'vue';

// Types
import type { TPublishedPageSummary } from '../../src/runtime/modules/common/types/bricks-api';

// Utils
import { createPageBuilder } from '../helpers/publishFixtures';

// Composables
import { useToolbarPageSelector } from '../../src/runtime/modules/builder/shell/toolbar/composables/useToolbarPageSelector';
// #endregion

const buildPage = createPageBuilder({});

/**
 * Собирает список страниц с предсказуемыми названиями и адресами.
 *
 * @param count - Сколько строк нужно.
 * @returns Сводки страниц.
 */
function buildPages(count: number): TPublishedPageSummary[] {
    return Array.from({ length: count }, (_unused, index) =>
        buildPage({ id: index + 1, pagename: `page-${index + 1}`, title: `Страница ${index + 1}` })
    );
}

describe('селектор страниц тулбара: поиск и фильтрация', () => {
    it('поле поиска появляется, когда список перестаёт помещаться целиком', () => {
        const pages = ref(buildPages(6));
        const selector = useToolbarPageSelector({ pages });

        expect(selector.isSearchVisible.value).toBe(false);

        pages.value = buildPages(7);
        expect(selector.isSearchVisible.value).toBe(true);
    });

    it('фильтрует и по названию, и по адресу, без учёта регистра и краевых пробелов', () => {
        const pages = ref([
            ...buildPages(6),
            buildPage({ id: 7, pagename: 'about', title: 'О компании' }),
            buildPage({ id: 8, pagename: 'contacts', title: 'Контакты' }),
        ]);
        const selector = useToolbarPageSelector({ pages });

        selector.searchQuery.value = '  КОНТ  ';
        expect(selector.filteredPages.value.map((page) => page.pagename)).toEqual(['contacts']);

        selector.searchQuery.value = 'abou';
        expect(selector.filteredPages.value.map((page) => page.pagename)).toEqual(['about']);
    });

    it('пустой результат отличается от пустого списка', () => {
        const pages = ref(buildPages(8));
        const selector = useToolbarPageSelector({ pages });

        expect(selector.isEmptyResult.value).toBe(false);

        selector.searchQuery.value = 'портфолио';
        expect(selector.filteredPages.value).toEqual([]);
        expect(selector.isEmptyResult.value).toBe(true);
    });

    it('скрытое поле поиска не фильтрует список', () => {
        const pages = ref(buildPages(8));
        const selector = useToolbarPageSelector({ pages });

        selector.searchQuery.value = 'страница 8';
        expect(selector.filteredPages.value).toHaveLength(1);

        // Список сократился уже после набора (страницы удалили в соседней вкладке):
        // поле исчезло, и продолжать фильтровать по невидимому запросу — значит
        // показывать урезанный список без способа это заметить
        pages.value = buildPages(6);
        expect(selector.filteredPages.value).toHaveLength(6);
        expect(selector.isEmptyResult.value).toBe(false);
    });

    it('закрытие попапа сбрасывает запрос', () => {
        const pages = ref(buildPages(8));
        const selector = useToolbarPageSelector({ pages });

        selector.handleOpenChange(true);
        selector.searchQuery.value = 'about';

        selector.handleOpenChange(false);

        expect(selector.isOpen.value).toBe(false);
        expect(selector.searchQuery.value).toBe('');
        expect(selector.filteredPages.value).toHaveLength(8);
    });
});
