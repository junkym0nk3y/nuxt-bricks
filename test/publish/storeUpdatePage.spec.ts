// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Utils
import {
    createFormStateBuilder,
    createPageBuilder,
    makeConflictFetchError,
} from '../helpers/publishFixtures';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({ id: 9, socialImage: '', revision: 3 });
const buildFormState = createFormStateBuilder();

describe('usePublishStore.updatePage: optimistic locking', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
    });

    it('шлёт expected_revision из локального списка и заменяет запись ответом', async () => {
        const store = usePublishStore();
        store.publishedPages = [buildPage()];

        apiFetcherMock.mockResolvedValueOnce(
            buildPage({ revision: 4, updatedAt: '2026-07-10T00:00:00Z' })
        );

        await store.updatePage(9, { components: [] }, buildFormState());

        const [url, options] = apiFetcherMock.mock.calls[0] as [
            string,
            { method: string; body: Record<string, unknown> },
        ];
        expect(url).toBe('/api/bricks/9/');
        expect(options.method).toBe('PUT');
        expect(options.body.expected_revision).toBe(3);

        // Локальная запись синхронизирована ответом — без loadAllPages
        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(store.getPageById(9)?.revision).toBe(4);
        expect(store.getPageById(9)?.updatedAt).toBe('2026-07-10T00:00:00Z');
    });

    it('страница без revision — понятная ошибка без запроса (precondition обязателен)', async () => {
        const store = usePublishStore();
        store.publishedPages = [buildPage({ revision: undefined })];

        await expect(store.updatePage(9, { components: [] }, buildFormState())).rejects.toThrow(
            'bricks.publish.toasts.savePageFailed'
        );
        expect(apiFetcherMock).not.toHaveBeenCalled();
    });

    it('409 REVISION_CONFLICT → обновляет список и бросает локализованное сообщение', async () => {
        const store = usePublishStore();
        store.publishedPages = [buildPage()];

        apiFetcherMock.mockImplementation((_url: string, options?: { method?: string }) => {
            if (options?.method === 'PUT') {
                return Promise.reject(makeConflictFetchError());
            }
            // GET /api/bricks/ — refetch списка после конфликта
            return Promise.resolve([buildPage({ revision: 5 })]);
        });

        await expect(store.updatePage(9, { components: [] }, buildFormState())).rejects.toThrow(
            'bricks.publish.toasts.revisionConflict'
        );

        // revision обновлён — повторное сохранение уйдёт со свежим precondition
        expect(store.getPageById(9)?.revision).toBe(5);
    });

    it('patchPage с expectedRevision: конфликт обрабатывается так же', async () => {
        const store = usePublishStore();
        store.publishedPages = [buildPage()];

        apiFetcherMock.mockImplementation((_url: string, options?: { method?: string }) => {
            if (options?.method === 'PATCH') {
                return Promise.reject(makeConflictFetchError());
            }
            return Promise.resolve([buildPage({ revision: 6 })]);
        });

        await expect(store.patchPage(9, { title: 'New', expectedRevision: 3 })).rejects.toThrow(
            'bricks.publish.toasts.revisionConflict'
        );
        expect(store.getPageById(9)?.revision).toBe(6);
    });
});
