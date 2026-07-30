// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { TPublishFormState } from '../../src/runtime/modules/common/types/bricks-api';
import type { IDeferredApi } from '../helpers/types';

// Utils
import { createDeferredApi } from '../helpers/builderSessionHarness';
import { createFormStateBuilder, createPageBuilder } from '../helpers/publishFixtures';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildFormState = createFormStateBuilder({
    pagename: 'landing-page',
    title: 'Landing',
    description: 'Описание страницы',
});

const buildPage = createPageBuilder({ pagename: 'landing-page', title: 'Landing' });

/**
 * Форма с нестроковым значением — такой она приезжает из повреждённого черновика
 * localStorage: `JSON.parse` типов не проверяет, а `normalizeFormState` только
 * подставляет отсутствующие поля. Значение ставится через `Reflect.set`, потому
 * что двойное приведение типов в проекте запрещено.
 *
 * @returns Состояние формы, на котором валидатор бросает исключение.
 */
function buildCorruptedFormState(): TPublishFormState {
    const formState = buildFormState();
    Reflect.set(formState, 'urlPrefix', 42);

    return formState;
}

describe('Операции записи лендинга принадлежат своей сессии', () => {
    let deferred: IDeferredApi;

    beforeEach(() => {
        setActivePinia(createPinia());
        deferred = createDeferredApi();
        apiFetcherMock.mockReset();
        apiFetcherMock.mockImplementation((url: string, options?: { method?: string }) => {
            if (options?.method === 'POST' || options?.method === 'PUT') {
                return deferred.handle(url);
            }

            // GET списка — освежение после создания, ответ не важен
            return Promise.resolve([]);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('вторая запись при идущей первой не уходит на сервер и не трогает форму', async () => {
        const store = usePublishStore();
        store.setCurrentFormState(buildFormState());

        const firstWrite = store.publishCurrentPage({ components: [] });
        const request = await deferred.waitFor('/api/bricks/');
        expect(store.isSubmitting).toBe(true);

        const secondResult = await store.publishCurrentPage({ components: [] });

        expect(secondResult).toBeNull();
        // Ровно один POST: guard стоит до запроса, а не после ответа
        expect(
            apiFetcherMock.mock.calls.filter(([, options]) => options?.method === 'POST')
        ).toHaveLength(1);
        // Первая операция всё ещё идёт — её индикатор снимать некому
        expect(store.isSubmitting).toBe(true);

        request.resolve(buildPage({ id: 7 }));
        await firstWrite;

        expect(store.isSubmitting).toBe(false);
    });

    it('вторая копия при идущей первой не подменяет форму копией', async () => {
        const store = usePublishStore();
        store.setCurrentFormState(buildFormState());
        store.editingPageId = 1;
        store.publishedPages = [buildPage({ id: 1 })];

        const firstCopy = store.saveCurrentPageAsCopy({ components: [] });
        const request = await deferred.waitFor('/api/bricks/');

        const secondResult = await store.saveCurrentPageAsCopy({ components: [] });

        expect(secondResult).toBeNull();
        // Форма на время копии подменена первой операцией. Заявка на запись
        // стоит до подмены именно поэтому: пройди второй вызов дальше, он снял
        // бы «оригинал» с уже подменённого состояния и подменил бы форму
        // повторно — на экране (и в автосохранённом черновике) оказался бы
        // заголовок копии копии, а откат первой операции вернул бы не то, с
        // чего начинали. Слаг этого не показывает: `generateCopyPagename`
        // срезает уже имеющийся суффикс `-copy`, а заголовок — нет
        expect(store.currentFormState.title).toBe('Landing (copy)');
        expect(store.currentFormState.pagename).toBe('landing-page-copy');
        expect(store.editingPageId).toBeNull();

        request.resolve(buildPage({ id: 8, pagename: 'landing-page-copy' }));
        await firstCopy;

        expect(store.currentFormState.pagename).toBe('landing-page');
        expect(store.currentFormState.title).toBe('Landing');
        expect(store.editingPageId).toBe(1);
        expect(store.isSubmitting).toBe(false);
    });

    it('исключение до запроса становится отказом, а не необслуженным промисом', async () => {
        const store = usePublishStore();
        // Форма из повреждённого черновика: `normalizeFormState` заполняет
        // отсутствующие поля, но типов не проверяет, и нестроковое значение
        // доходит до `.trim()` в валидаторе. Вызывающий такое исключение не
        // ловит — сохранение просто await'ится, поэтому вместо сообщения об
        // ошибке пользователь не получил бы ничего
        store.currentFormState = buildCorruptedFormState();

        await expect(store.publishCurrentPage({ components: [] })).resolves.toBeNull();

        expect(store.generalError).not.toBe('');
        // Заявка на запись к этому моменту уже открыта — без общего `finally`
        // кнопки остались бы заблокированными до перезагрузки редактора
        expect(store.isSubmitting).toBe(false);

        // Запись после сорвавшейся попытки по-прежнему возможна
        store.setCurrentFormState(buildFormState());
        const write = store.publishCurrentPage({ components: [] });
        const request = await deferred.waitFor('/api/bricks/');
        expect(store.isSubmitting).toBe(true);

        request.resolve(buildPage({ id: 21 }));
        await write;
    });

    it('исключение при подготовке копии откатывает форму и сообщает об отказе', async () => {
        const store = usePublishStore();
        store.editingPageId = 1;
        store.publishedPages = [buildPage({ id: 1 })];
        store.currentFormState = buildCorruptedFormState();

        await expect(store.saveCurrentPageAsCopy({ components: [] })).resolves.toBeNull();

        expect(store.generalError).not.toBe('');
        expect(store.isSubmitting).toBe(false);
        // Форма к этому моменту уже подменена состоянием копии: без отката
        // пользователь остался бы на чужом слаге и с `editingPageId === null`,
        // то есть следующее сохранение ушло бы созданием второй страницы
        expect(store.currentFormState.pagename).toBe('landing-page');
        expect(store.editingPageId).toBe(1);
    });

    it('запись покинутой страницы не держит индикатор и не блокирует запись новой', async () => {
        const store = usePublishStore();
        store.setCurrentFormState(buildFormState());

        const abandonedWrite = store.publishCurrentPage({ components: [] });
        const abandonedRequest = await deferred.waitFor('/api/bricks/');
        expect(store.isSubmitting).toBe(true);

        // Открытие другой страницы билдера: операции прежней сессии забыты, их
        // запросы при этом продолжают лететь
        store.resetActiveWrites();
        expect(store.isSubmitting).toBe(false);

        store.setCurrentFormState(buildFormState({ pagename: 'other-page', title: 'Other' }));
        const currentWrite = store.publishCurrentPage({ components: [] });
        const currentRequest = await deferred.waitFor('/api/bricks/');
        expect(store.isSubmitting).toBe(true);

        // Завершение операции покинутой страницы не снимает индикатор с идущей
        abandonedRequest.resolve(buildPage({ id: 11 }));
        await abandonedWrite;
        expect(store.isSubmitting).toBe(true);

        currentRequest.resolve(buildPage({ id: 12, pagename: 'other-page' }));
        await currentWrite;
        expect(store.isSubmitting).toBe(false);
    });
});
