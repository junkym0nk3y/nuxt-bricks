/**
 * Переключатель публикации в панели деталей дашборда.
 *
 * Что здесь сторожится:
 *
 * 1. Одна запись НА СТРАНИЦУ. Два быстрых щелчка уходили двумя параллельными
 *    PATCH'ами без предусловия, и `syncPageInList` применял ответ каждого: итог
 *    зависел от порядка ответов, а не от последнего намерения человека. Занятость
 *    при этом не глобальная: у переключения другой страницы свой откат, а общий
 *    флаг молча отбрасывал бы щелчок по тумблеру страницы, открытой следом, —
 *    тумблер показывает состояние СВОЕЙ страницы и такой отказ выразить не может.
 * 2. Откат по отказу трогает только СВОЮ оптимистичную запись. Пока PATCH в
 *    воздухе, список успевает получить свежий ответ сервера — своей записью
 *    соседнего редактора или перечитыванием, которое `toPageWriteError` заводит на
 *    конфликте и на обрыве. Откат по значению флага снёс бы этот ответ:
 *    публикация прыгнула бы к состоянию до чужой правки. Различает их
 *    идентичность записи в списке, а не boolean.
 * 3. Занятость снимается на любом исходе: иначе первый же отказ запирал бы
 *    переключатель до перезагрузки экрана.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Utils
import { createPageBuilder, seedLoadedPages } from '../helpers/publishFixtures';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import { usePublishPageActions } from '../../src/runtime/modules/builder/publish/composables/usePublishPageActions';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({ published: false });

describe('togglePublished: переключатель публикации страницы', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('второй щелчок во время запроса второго PATCH не отправляет', async () => {
        const store = usePublishStore();
        const page = buildPage({ id: 7 });
        seedLoadedPages(store, [page]);

        // Присваивается синхронно в моке ниже — до первого использования
        let finishPatch!: (value: unknown) => void;

        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishPatch = resolve;
                })
        );

        const { togglePublished, togglingPageIds } = usePublishPageActions({ onNotify: vi.fn() });

        const first = togglePublished(page, true);

        expect(togglingPageIds.value.has('7')).toBe(true);

        // Человек щёлкнул второй раз, пока первый запрос в воздухе
        await togglePublished(page, false);

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);

        finishPatch({ ...page, published: true, revision: 2 });
        await first;

        expect(togglingPageIds.value.has('7')).toBe(false);
        expect(store.getPageById(7)?.published).toBe(true);
    });

    it('свежий ответ сервера с тем же значением поздний отказ не откатывает', async () => {
        const store = usePublishStore();
        const page = buildPage({ id: 7, revision: 1 });
        seedLoadedPages(store, [page]);

        // Присваивается синхронно в моке ниже — до первого использования
        let failPatch!: (error: Error) => void;

        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((_, reject) => {
                    failPatch = reject;
                })
        );

        const { togglePublished } = usePublishPageActions({ onNotify: vi.fn() });

        const pending = togglePublished(page, true);

        // Пока PATCH висит, список получает свежую страницу сервера — с тем же
        // значением флага, но это уже НЕ наша оптимистичная запись
        store.syncPageInList(buildPage({ id: 7, published: true, revision: 5 }));

        failPatch(new Error('503'));
        await pending;

        const current = store.getPageById(7);

        expect(current?.published).toBe(true);
        expect(current?.revision).toBe(5);
    });

    it('отказ возвращает прежнее значение и освобождает переключатель', async () => {
        const store = usePublishStore();
        const page = buildPage({ id: 7, published: false });
        seedLoadedPages(store, [page]);

        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        const onNotify = vi.fn();
        const { togglePublished, togglingPageIds } = usePublishPageActions({ onNotify });

        await togglePublished(page, true);

        expect(store.getPageById(7)?.published).toBe(false);
        expect(togglingPageIds.value.has('7')).toBe(false);
        // Текст приходит от слоя запроса (`PATCH /api/bricks/7: 503`), а не
        // дефолтным ключом: у отказа есть что сказать, и подменять его общей
        // фразой значит терять причину
        expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('503'), 'error');
    });

    // Тумблер в панели деталей показывает состояние СВОЕЙ страницы: пока запись
    // первой страницы в воздухе, человек успевает выбрать вторую, и её тумблер
    // выглядит рабочим. Глобальная занятость отбрасывала бы такой щелчок молча —
    // отказ, который контрол выразить не может
    it('переключение другой страницы первым запросом не блокируется', async () => {
        const store = usePublishStore();
        const first = buildPage({ id: 7 });
        const second = buildPage({ id: 8 });
        seedLoadedPages(store, [first, second]);

        // Присваивается синхронно в моке ниже — до первого использования
        let finishFirstPatch!: (value: unknown) => void;

        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishFirstPatch = resolve;
                })
        );
        apiFetcherMock.mockResolvedValueOnce({ ...second, published: true, revision: 2 });

        const { togglePublished, togglingPageIds } = usePublishPageActions({ onNotify: vi.fn() });

        const firstWrite = togglePublished(first, true);

        await togglePublished(second, true);

        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
        expect(store.getPageById(8)?.published).toBe(true);
        expect(togglingPageIds.value.has('8')).toBe(false);

        // Занятость первой страницы своим ответом и снимается, а не ответом второй
        expect(togglingPageIds.value.has('7')).toBe(true);

        finishFirstPatch({ ...first, published: true, revision: 2 });
        await firstWrite;

        expect(togglingPageIds.value.has('7')).toBe(false);
    });

    it('повторное переключение в то же значение запроса не делает', async () => {
        const store = usePublishStore();
        const page = buildPage({ id: 7, published: true });
        seedLoadedPages(store, [page]);

        const { togglePublished } = usePublishPageActions({ onNotify: vi.fn() });

        await togglePublished(page, true);

        expect(apiFetcherMock).not.toHaveBeenCalled();
    });
});
