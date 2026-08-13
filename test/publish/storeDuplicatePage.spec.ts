// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';
import { generateCopyPagename } from '../../src/runtime/modules/builder/publish/utils/slugify';

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
        viewportConfig: null,
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
            (url: string, options?: { method?: string; body?: Record<string, unknown> }) => {
                if (options?.method === 'POST') {
                    return Promise.resolve({ id: 99, pagename: options.body?.pagename });
                }

                // GET /api/bricks/:id/ — point-lookup полной страницы (список — сводки без schema)
                if (/^\/api\/bricks\/\d+\/$/.test(url)) {
                    return Promise.resolve(
                        buildPage({
                            id: 1,
                            pagename: 'home',
                            schema: { components: [{ id: 'source-brick' }] } as never,
                        })
                    );
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

        expect(
            generateCopyPagename({ pagename: 'home', urlPrefix: null }, (candidate) =>
                store.isAddressAvailable(candidate)
            )
        ).toBe('home-copy-2');
    });

    it('подбор копии идёт в пределах своего префикса', () => {
        const store = usePublishStore();
        store.publishedPages = [
            buildPage({ id: 1, pagename: 'post', urlPrefix: 'blog' }),
            // Занятые копии в чужом префиксе на подбор не влияют: копия наследует
            // `urlPrefix` оригинала, и по одному имени она уехала бы в -copy-2
            buildPage({ id: 2, pagename: 'post-copy', urlPrefix: 'news' }),
            buildPage({ id: 3, pagename: 'post-copy-1', urlPrefix: null }),
        ];

        expect(
            generateCopyPagename({ pagename: 'post', urlPrefix: 'blog' }, (candidate) =>
                store.isAddressAvailable(candidate)
            )
        ).toBe('post-copy');
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
        // Схема клона — из point-lookup'а исходной страницы, не из сводки списка
        expect(body.body.schema).toEqual({ components: [{ id: 'source-brick' }] });

        const pointLookupCall = apiFetcherMock.mock.calls.find(([url]) => {
            return url === '/api/bricks/1/';
        });
        expect(pointLookupCall).toBeTruthy();
    });

    it('duplicatePage бросает ошибку, если страница не найдена', async () => {
        const store = usePublishStore();
        store.publishedPages = [];

        await expect(store.duplicatePage(404)).rejects.toThrow();
        expect(apiFetcherMock).not.toHaveBeenCalled();
    });
});
