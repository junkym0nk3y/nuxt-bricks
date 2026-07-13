// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { nextTick, ref } from 'vue';

// Types
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';

// Composables
import { usePublishDashboard } from '../../src/runtime/modules/builder/publish/composables/usePublishDashboard';
// #endregion

/**
 * Собирает страницу для списка дашборда с переопределениями.
 *
 * @param overrides - Переопределяемые поля.
 * @returns Полная структура IPublishedPage.
 */
function buildPage(overrides: Partial<IPublishedPage>): IPublishedPage {
    return {
        id: 1,
        pagename: 'home',
        title: 'Home',
        description: 'Landing page',
        keywords: 'landing',
        backgroundColor: '#ffffff',
        layout: 'default',
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: null,
        schema: { components: [] },
        published: true,
        createdAt: '2026-06-01T10:00:00Z',
        updatedAt: '2026-06-30T10:00:00Z',
        ...overrides,
    };
}

const PAGES: IPublishedPage[] = [
    buildPage({ id: 1, pagename: 'home', title: 'Home', published: true }),
    buildPage({ id: 2, pagename: 'about', title: 'About us', published: true }),
    buildPage({
        id: 3,
        pagename: 'promo-draft',
        title: 'Promo',
        description: 'Черновик акции',
        published: false,
    }),
];

describe('usePublishDashboard: поиск и фильтры списка страниц', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('считает счётчики фильтров и отдаёт весь список без поиска', () => {
        const { filterCounts, filteredPages, hasAnyPages } = usePublishDashboard(ref(PAGES));

        expect(filterCounts.value).toEqual({ all: 3, published: 2, drafts: 1 });
        expect(filteredPages.value).toHaveLength(3);
        expect(hasAnyPages.value).toBe(true);
    });

    it('сегмент-фильтр отбирает опубликованные и черновики', () => {
        const { activeFilter, filteredPages } = usePublishDashboard(ref(PAGES));

        activeFilter.value = 'published';
        expect(filteredPages.value.map((page) => page.pagename)).toEqual(['home', 'about']);

        activeFilter.value = 'drafts';
        expect(filteredPages.value.map((page) => page.pagename)).toEqual(['promo-draft']);
    });

    it('поиск применяется с debounce 300мс по title/pagename/description', async () => {
        const { searchQuery, filteredPages } = usePublishDashboard(ref(PAGES));

        searchQuery.value = 'about';
        await nextTick();

        // До истечения debounce список не отфильтрован
        expect(filteredPages.value).toHaveLength(3);

        vi.advanceTimersByTime(301);
        expect(filteredPages.value.map((page) => page.pagename)).toEqual(['about']);
    });

    it('поиск регистронезависим и ищет по description', async () => {
        const { searchQuery, filteredPages } = usePublishDashboard(ref(PAGES));

        searchQuery.value = 'ЧЕРНОВИК';
        await nextTick();
        vi.advanceTimersByTime(301);

        expect(filteredPages.value.map((page) => page.pagename)).toEqual(['promo-draft']);
    });

    it('счётчики фильтров считаются от результатов поиска', async () => {
        const { searchQuery, filterCounts } = usePublishDashboard(ref(PAGES));

        searchQuery.value = 'promo';
        await nextTick();
        vi.advanceTimersByTime(301);

        expect(filterCounts.value).toEqual({ all: 1, published: 0, drafts: 1 });
    });

    it('hasAnyPages false только при полностью пустом списке', () => {
        const { hasAnyPages } = usePublishDashboard(ref<IPublishedPage[]>([]));

        expect(hasAnyPages.value).toBe(false);
    });
});
