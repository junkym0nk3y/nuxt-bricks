// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Utils
import { createFormStateBuilder, createPageBuilder } from '../helpers/publishFixtures';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({ socialImage: '' });
const buildFormState = createFormStateBuilder();

describe('usePublishStore.loadAllPages: общий кеш списка (BM-26)', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
    });

    it('ответ более раннего запроса не заменяет более свежий список', async () => {
        const store = usePublishStore();

        // Два запроса в полёте — уход с одной страницы билдера на другую: bootstrap
        // каждой зовёт loadAllPages, а порядок ответов не гарантирован
        let resolveStale: ((pages: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveStale = resolve;
                })
        );
        apiFetcherMock.mockResolvedValueOnce([buildPage({ id: 2, pagename: 'fresh' })]);

        const stale = store.loadAllPages();
        await store.loadAllPages();

        expect(store.publishedPages.map((page) => page.pagename)).toEqual(['fresh']);

        resolveStale?.([buildPage({ id: 1, pagename: 'stale' })]);
        await stale;

        expect(store.publishedPages.map((page) => page.pagename)).toEqual(['fresh']);
    });

    it('локальная запись в список обесценивает уже летящий GET', async () => {
        const store = usePublishStore();

        // GET стартовал до того, как копия была создана
        let resolveStale: ((pages: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveStale = resolve;
                })
        );

        const stale = store.loadAllPages();

        // Save as Copy успел приземлиться и добавил копию в локальный список
        store.syncPageInList(buildPage({ id: 3, pagename: 'original-copy', revision: 1 }));

        // Ответ GET'а копии ещё не знает: без обесценивания он вернул бы список к
        // состоянию до неё — страница пропала бы из дашборда, а прежняя revision
        // уронила бы следующее сохранение ложным 409
        resolveStale?.([buildPage({ id: 1, pagename: 'original', revision: 4 })]);
        await stale;

        expect(store.getPageById(3)?.pagename).toBe('original-copy');
    });

    it('созданная страница попадает в список, даже если GET обесценен параллельной записью', async () => {
        const store = usePublishStore();

        // POST создания отвечает сразу, следующий за ним GET списка — отложен
        let resolveList: ((pages: unknown) => void) | undefined;
        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 11, pagename: 'fresh-page' }));
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveList = resolve;
                })
        );

        const publishing = store.publishPage(
            { components: [] },
            buildFormState({ pagename: 'fresh-page' })
        );

        // Ждём, пока POST отработает и GET списка уйдёт в полёт
        await vi.waitFor(() => {
            expect(resolveList).toBeDefined();
        });

        // Пока GET в полёте, приземляется другая локальная запись (например, PATCH
        // превью прежней страницы) и обесценивает его
        store.syncPageInList(buildPage({ id: 2, pagename: 'other', revision: 9 }));

        resolveList?.([buildPage({ id: 2, pagename: 'other', revision: 9 })]);
        const createdId = await publishing;

        // Без синхронизации ответом POST страница потерялась бы вместе с GET, и
        // startEditingPage оставил бы editingPageId === null
        expect(createdId).toBe(11);
        expect(store.getPageById(11)?.pagename).toBe('fresh-page');

        store.startEditingPage(11);
        expect(store.editingPageId).toBe(11);
    });

    it('отказ обновления списка после успешного POST не проваливает создание', async () => {
        const store = usePublishStore();

        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 12, pagename: 'created-page' }));
        apiFetcherMock.mockRejectedValueOnce(new Error('GET /api/bricks/: 503'));

        // Страница создана на сервере; отказ последующего GET — это неудачное
        // освежение списка, а не неудачное создание. Иначе билдер показал бы
        // «сохранить не удалось», а повтор упёрся бы в собственный slug как занятый
        const createdId = await store.publishPage(
            { components: [] },
            buildFormState({ pagename: 'created-page' })
        );

        expect(createdId).toBe(12);
        expect(store.getPageById(12)?.pagename).toBe('created-page');
        expect(store.isPagenameAvailable('created-page', 12)).toBe(true);
    });

    it('зависшее обновление списка не задерживает создание', async () => {
        const store = usePublishStore();

        let resolveHungList: ((pages: unknown) => void) | undefined;
        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 13, pagename: 'hung-refresh' }));
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveHungList = resolve;
                })
        );

        try {
            // GET списка не отвечает и не падает. Прикладного таймаута у него нет,
            // поэтому `await` держал бы `isSubmitting` поднятым — а он общий и
            // блокирует сохранение в той сессии, куда пользователь успел уйти
            const createdId = await store.publishPage(
                { components: [] },
                buildFormState({ pagename: 'hung-refresh' })
            );

            expect(createdId).toBe(13);
            expect(store.getPageById(13)?.pagename).toBe('hung-refresh');
            expect(resolveHungList).toBeDefined();
        } finally {
            resolveHungList?.([]);
        }
    });

    it('ошибка загрузки не пишет в generalError — только бросает', async () => {
        const store = usePublishStore();
        apiFetcherMock.mockRejectedValueOnce(new Error('GET /api/bricks/: 500'));

        await expect(store.loadAllPages()).rejects.toThrow('GET /api/bricks/: 500');

        // generalError — поле формы публикации открытой страницы: отказ загрузки
        // списка на покинутой подсвечивал бы ошибку в чужом сайдбаре
        expect(store.generalError).toBe('');
    });
});
