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

describe('usePublishStore.loadAllPages: общий кеш списка', () => {
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

    it('созданная страница попадает в список, даже если летящий GET её не знает', async () => {
        const store = usePublishStore();

        // Список читает кто-то другой — обновление в дашборде или bootstrap
        // соседней сессии, — и его GET уже в полёте, когда уходит POST создания
        let resolveList: ((pages: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveList = resolve;
                })
        );

        const listing = store.loadAllPages();

        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 11, pagename: 'fresh-page' }));

        const createdId = await store.publishPage(
            { components: [] },
            buildFormState({ pagename: 'fresh-page' })
        );

        // Ответ GET создания не знает: он ушёл раньше. Локальная запись его
        // обесценила, и вернуть список к состоянию до создания он не вправе
        resolveList?.([buildPage({ id: 2, pagename: 'other', revision: 9 })]);
        await listing;

        // Без синхронизации ответом POST страница потерялась бы вместе с этим
        // ответом, и startEditingPage оставил бы editingPageId === null: следующее
        // сохранение ушло бы вторым созданием вместо обновления
        expect(createdId).toBe(11);
        expect(store.getPageById(11)?.pagename).toBe('fresh-page');

        store.startEditingPage(11);
        expect(store.editingPageId).toBe(11);
    });

    it('отказ параллельного чтения списка не проваливает создание', async () => {
        const store = usePublishStore();

        // Чтение списка отказано (503) — соседним обновлением в дашборде, не
        // созданием: успешная публикация список не перечитывает вовсе
        apiFetcherMock.mockRejectedValueOnce(new Error('GET /api/bricks/: 503'));

        const listing = store.loadAllPages().catch(() => undefined);

        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 12, pagename: 'created-page' }));

        // Страница создана на сервере, и отказ чужого чтения к этому отношения не
        // имеет. Иначе билдер показал бы «сохранить не удалось», а повтор упёрся бы
        // в собственный slug как занятый
        const createdId = await store.publishPage(
            { components: [] },
            buildFormState({ pagename: 'created-page' })
        );

        await listing;

        expect(createdId).toBe(12);
        expect(store.getPageById(12)?.pagename).toBe('created-page');
        expect(store.isAddressAvailable({ pagename: 'created-page', urlPrefix: null }, 12)).toBe(
            true
        );
    });

    it('обрыв удаления по таймауту освежает список', async () => {
        const store = usePublishStore();
        store.publishedPages = [buildPage({ id: 21, pagename: 'doomed' })];

        // DELETE оборван потолком: сервер мог успеть удалить страницу, поэтому
        // список нужно перечитать — иначе удалённая осталась бы в дашборде, а
        // повторное удаление получило бы 404
        const timeout = Object.assign(new Error('aborted due to timeout'), {
            name: 'TimeoutError',
        });
        apiFetcherMock.mockRejectedValueOnce(
            new Error('[DELETE] "/api/bricks/21/": <no response>', { cause: timeout })
        );
        apiFetcherMock.mockResolvedValueOnce([]);

        await expect(store.deletePage(21)).rejects.toThrow();

        // Освежение отпущено, а не ожидается: ошибка доходит сразу, список
        // догоняет ответом
        await vi.waitFor(() => expect(store.publishedPages).toHaveLength(0));
    });

    it('отказ вытесненного запроса не доходит до вызывающего', async () => {
        const store = usePublishStore();

        let rejectStale: ((error: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    rejectStale = reject;
                })
        );
        apiFetcherMock.mockResolvedValueOnce([buildPage({ id: 31, pagename: 'fresh' })]);

        const stale = store.loadAllPages();
        await store.loadAllPages();

        // Список уже обновлён более свежим запросом. Ошибка устаревшего перевела бы
        // в отказ актуальный bootstrap сессии — блокирующим экраном поверх рабочей
        // страницы, хотя загружать больше нечего
        rejectStale?.(new Error('GET /api/bricks/: 503'));

        await expect(stale).resolves.toBeUndefined();
        expect(store.publishedPages.map((page) => page.pagename)).toEqual(['fresh']);
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
