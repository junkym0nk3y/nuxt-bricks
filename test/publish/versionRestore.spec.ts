// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Utils
import { createPageBuilder, makeConflictFetchError } from '../helpers/publishFixtures';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({ id: 9, socialImage: '', revision: 3 });

describe('usePublishStore.restorePageVersion: обязательный revision-precondition', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
    });

    it('шлёт expected_revision из локального списка и заменяет запись ответом', async () => {
        const store = usePublishStore();
        store.publishedPages = [buildPage()];

        apiFetcherMock.mockResolvedValueOnce(
            buildPage({ revision: 4, updatedAt: '2026-07-11T00:00:00Z' })
        );

        await store.restorePageVersion(9, 5);

        const [url, options] = apiFetcherMock.mock.calls[0] as [
            string,
            { method: string; body: Record<string, unknown> },
        ];
        expect(url).toBe('/api/bricks/9/versions/5/restore/');
        expect(options.method).toBe('POST');
        expect(options.body.expected_revision).toBe(3);

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(store.getPageById(9)?.revision).toBe(4);
        expect(store.getPageById(9)?.updatedAt).toBe('2026-07-11T00:00:00Z');
    });

    it('страница без revision в локальном списке — бросает понятную ошибку без запроса', async () => {
        const store = usePublishStore();
        store.publishedPages = [buildPage({ revision: undefined })];

        await expect(store.restorePageVersion(9, 5)).rejects.toThrow(
            'bricks.publish.dashboard.details.versions.toasts.restoreFailed'
        );
        expect(apiFetcherMock).not.toHaveBeenCalled();
    });

    it('страница не найдена в локальном списке — бросает понятную ошибку без запроса', async () => {
        const store = usePublishStore();
        store.publishedPages = [];

        await expect(store.restorePageVersion(9, 5)).rejects.toThrow(
            'bricks.publish.dashboard.details.versions.toasts.restoreFailed'
        );
        expect(apiFetcherMock).not.toHaveBeenCalled();
    });

    it('409 REVISION_CONFLICT → обновляет список и бросает локализованное сообщение (без success)', async () => {
        const store = usePublishStore();
        store.publishedPages = [buildPage()];

        apiFetcherMock.mockImplementation((_url: string, options?: { method?: string }) => {
            if (options?.method === 'POST') {
                return Promise.reject(makeConflictFetchError());
            }
            // GET /api/bricks/ — refetch списка после конфликта
            return Promise.resolve([buildPage({ revision: 6 })]);
        });

        await expect(store.restorePageVersion(9, 5)).rejects.toThrow(
            'bricks.publish.toasts.revisionConflict'
        );

        // revision обновлён refetch'ем — повторный откат уйдёт со свежим precondition
        expect(store.getPageById(9)?.revision).toBe(6);
    });
});
