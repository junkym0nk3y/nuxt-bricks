// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Utils
import { createPageBuilder } from '../helpers/publishFixtures';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({ socialImage: '' });

describe('usePublishStore.ensurePagesLoaded: полнота списка', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
    });

    it('пустой ответ считается загруженным списком и не повторяется', async () => {
        const store = usePublishStore();
        apiFetcherMock.mockResolvedValue([]);

        await store.ensurePagesLoaded();
        await store.ensurePagesLoaded();

        // Пустой список законен (проект без сохранённых страниц): считать его
        // признаком незагруженности — значит запрашивать его при каждом открытии
        // селектора страниц
        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(store.pagesLoadedAt).not.toBeNull();
    });

    it('параллельные вызовы ждут один запрос', async () => {
        const store = usePublishStore();

        let resolveList: ((pages: unknown) => void) | undefined;
        apiFetcherMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveList = resolve;
                })
        );

        const first = store.ensurePagesLoaded();
        const second = store.ensurePagesLoaded();

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);

        resolveList?.([buildPage({ id: 1, pagename: 'home' })]);
        await Promise.all([first, second]);

        expect(store.publishedPages.map((page) => page.pagename)).toEqual(['home']);
    });

    it('вытесненный ответ не принимается за полный список', async () => {
        const store = usePublishStore();

        // Первый GET обгоняет локальная запись: его ответ отбрасывается, и в сторе
        // остаются только локально известные строки — полным списком они не
        // являются, поэтому запрос повторяется
        let resolveStale: ((pages: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveStale = resolve;
                })
        );
        apiFetcherMock.mockResolvedValueOnce([
            buildPage({ id: 1, pagename: 'home' }),
            buildPage({ id: 2, pagename: 'about' }),
        ]);

        const ensuring = store.ensurePagesLoaded();
        await Promise.resolve();

        store.invalidatePendingPagesLoad();
        resolveStale?.([buildPage({ id: 1, pagename: 'home' })]);
        await ensuring;

        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
        expect(store.publishedPages.map((page) => page.pagename)).toEqual(['home', 'about']);
        expect(store.pagesLoadedAt).not.toBeNull();
    });

    it('исчерпанные попытки — отказ, а не успех с неполным списком', async () => {
        const store = usePublishStore();

        // Каждый ответ обесценивается локальной записью: в сторе остаются только
        // локально известные строки. Молчаливый успех здесь опаснее отказа —
        // открытие сессии приняло бы существующую страницу за новую и подставило
        // пустой холст поверх сохранённой
        apiFetcherMock.mockImplementation(() => {
            store.invalidatePendingPagesLoad();
            return Promise.resolve([buildPage({ id: 1, pagename: 'home' })]);
        });

        await expect(store.ensurePagesLoaded()).rejects.toThrow();
        expect(store.pagesLoadedAt).toBeNull();
    });

    it('отказ доходит до вызывающего и не помечает список загруженным', async () => {
        const store = usePublishStore();
        apiFetcherMock.mockRejectedValue(new Error('Network down'));

        // Открытие сессии билдера держит на этом отказе блокирующий экран, поэтому
        // глушить его в сторе нельзя
        await expect(store.ensurePagesLoaded()).rejects.toThrow('Network down');
        expect(store.pagesLoadedAt).toBeNull();
    });
});
