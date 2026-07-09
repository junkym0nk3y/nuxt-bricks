// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IPublishedPage } from '../src/runtime/modules/common/types/bricks-api';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../src/runtime/modules/builder/publish/stores/publish';

/**
 * Собирает страницу для стейта стора с переопределениями.
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

describe('usePublishStore: дублирование страницы', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
        apiFetcherMock.mockImplementation(
            (_url: string, options?: { method?: string; body?: Record<string, unknown> }) => {
                if (options?.method === 'POST') {
                    return Promise.resolve({ id: 99, pagename: options.body?.pagename });
                }
                // GET /api/bricks/ после publishPage (loadAllPages)
                return Promise.resolve([]);
            }
        );
    });

    it('generateCopyPagename даёт уникальный pagename при занятых копиях', () => {
        const store = usePublishStore();
        store.publishedPages = [
            buildPage({ id: 1, pagename: 'home' }),
            buildPage({ id: 2, pagename: 'home-copy' }),
            buildPage({ id: 3, pagename: 'home-copy-1' }),
        ];

        expect(store.generateCopyPagename('home')).toBe('home-copy-2');
    });

    it('duplicatePage по id создаёт черновик с уникальным pagename и суффиксом (copy)', async () => {
        const store = usePublishStore();
        store.publishedPages = [
            buildPage({ id: 1, pagename: 'home', title: 'Home', published: true }),
            buildPage({ id: 2, pagename: 'home-copy', title: 'Home (copy)', published: false }),
        ];

        const createdId = await store.duplicatePage(1);

        expect(createdId).toBe(99);

        const postCall = apiFetcherMock.mock.calls.find(([, options]) => {
            return (options as { method?: string } | undefined)?.method === 'POST';
        });
        expect(postCall).toBeTruthy();

        const body = (postCall as unknown[])[1] as { body: Record<string, unknown> };
        expect(body.body.pagename).toBe('home-copy-1');
        expect(body.body.title).toBe('Home (copy)');
        expect(body.body.published).toBe(false);
    });

    it('duplicatePage бросает ошибку, если страница не найдена', async () => {
        const store = usePublishStore();
        store.publishedPages = [];

        await expect(store.duplicatePage(404)).rejects.toThrow();
        expect(apiFetcherMock).not.toHaveBeenCalled();
    });
});
