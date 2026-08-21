/**
 * Стор категорий медиатеки: одновременные чтения и снимок ряда чипов.
 *
 * Раздел «Медиатека» на дашборде монтируется на каждое переключение рейла,
 * поэтому быстрый уход-возврат заводил два GET подряд. Это не просто лишний
 * запрос: второй обесценивает ответ первого номером запроса, и если сам он потом
 * откажет, ряд чипов останется пустым при успешном первом ответе.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { useMediaCategoriesStore } from '../../src/runtime/modules/builder/media/stores/mediaCategories';

// #region Helpers
/** Ответ ручки списка категорий. */
const CATEGORIES_RESPONSE = {
    success: true,
    items: [{ id: 1, slug: 'promo', label: 'Промо', sort_order: 1 }],
};

/**
 * Откладывает ответ ручки до ручного разрешения — так ловится состояние
 * «запрос ещё летит».
 *
 * @returns Промис ответа и его разрешатель.
 */
function createDeferredResponse(): { promise: Promise<unknown>; resolve: () => void } {
    let release: (() => void) | null = null;
    const promise = new Promise<unknown>((resolvePromise) => {
        release = () => resolvePromise(CATEGORIES_RESPONSE);
    });

    if (!release) {
        throw new Error('Разрешатель ответа не собрался');
    }

    return { promise, resolve: release };
}
// #endregion

describe('стор категорий: одновременные чтения', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
    });

    it('второе чтение ждёт летящее, а не заводит свой запрос', async () => {
        const store = useMediaCategoriesStore();
        const deferred = createDeferredResponse();

        apiFetcherMock.mockImplementationOnce(() => deferred.promise);

        const first = store.loadCategories();
        const second = store.loadCategories();

        deferred.resolve();
        await Promise.all([first, second]);

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(store.categories).toHaveLength(1);
        expect(store.hasLoadedCategoriesSnapshot).toBe(true);
    });

    it('прочитанный ряд повторно не запрашивается вызывающими со снимком', async () => {
        const store = useMediaCategoriesStore();

        apiFetcherMock.mockResolvedValueOnce(CATEGORIES_RESPONSE);
        await store.loadCategories();

        expect(store.hasLoadedCategoriesSnapshot).toBe(true);

        apiFetcherMock.mockResolvedValueOnce(CATEGORIES_RESPONSE);
        await store.loadCategories();

        // Сам стор чтение не гасит: гард по снимку живёт у вызывающего, и
        // повторный вызов обязан сходить на сервер
        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
    });

    // Локальная вставка или удаление чипа обесценивает летящий ответ: следующий
    // вызов обязан завести свой запрос, иначе он дождался бы ответа, который
    // уже некуда применить
    it('после обесценивания следующее чтение идёт своим запросом', async () => {
        const store = useMediaCategoriesStore();
        const deferred = createDeferredResponse();

        apiFetcherMock.mockImplementationOnce(() => deferred.promise);

        const stale = store.loadCategories();

        store.invalidatePendingCategoriesLoad();

        apiFetcherMock.mockResolvedValueOnce(CATEGORIES_RESPONSE);
        const fresh = store.loadCategories();

        deferred.resolve();
        await Promise.all([stale, fresh]);

        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
        expect(store.categories).toHaveLength(1);
    });

    // Перечитывание после обрыва записи обязано идти СВОИМ запросом: летящий GET
    // мог стартовать до неё и об исходе записи ничего не знает, а коалесинг
    // подсунул бы его ответ как достоверный снимок
    it('перечитывание после таймаута записи не присоединяется к летящему чтению', async () => {
        const store = useMediaCategoriesStore();
        const deferred = createDeferredResponse();

        apiFetcherMock.mockImplementationOnce(() => deferred.promise);

        const stale = store.loadCategories();

        apiFetcherMock.mockResolvedValueOnce(CATEGORIES_RESPONSE);
        store.reloadCategoriesDetached();

        deferred.resolve();
        await stale;
        await Promise.resolve();

        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
    });
});
