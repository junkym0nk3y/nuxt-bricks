/**
 * Занятость копирования страницы в дашборде.
 *
 * Что здесь сторожится: занятость держится ПО СТРАНИЦЕ, а не одна на дашборд.
 * Второй щелчок по той же строке породил бы вторую копию одной страницы, поэтому
 * он отсекается. А вот копирование соседней строки — независимая запись: имя копии
 * подбирается внутри адреса своей страницы, поэтому два копирования не могут
 * претендовать на один адрес, и общего состояния между ними нет. Общий флаг при
 * этом отбрасывал бы щелчок по кнопке другой строки молча — кнопки нарисованы по
 * странице, и такой отказ они выразить не могут.
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

describe('duplicatePage: занятость строки списка', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('второй щелчок по той же строке второй копии не создаёт', async () => {
        const store = usePublishStore();
        const page = buildPage({ id: 7, pagename: 'landing' });
        seedLoadedPages(store, [page]);

        // Присваивается синхронно в моке ниже — до первого использования
        let finishSourceRead!: (value: unknown) => void;

        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishSourceRead = resolve;
                })
        );

        const { duplicatePage, duplicatingPageIds } = usePublishPageActions({
            onNotify: vi.fn(),
        });

        const first = duplicatePage(page);

        expect(duplicatingPageIds.value.has('7')).toBe(true);

        await duplicatePage(page);

        // Только чтение схемы источника: второй проход не начался
        expect(apiFetcherMock).toHaveBeenCalledTimes(1);

        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 8, pagename: 'landing-copy' }));
        finishSourceRead(buildPage({ id: 7, pagename: 'landing' }));
        await first;

        expect(duplicatingPageIds.value.has('7')).toBe(false);
    });

    it('копирование другой строки первым не блокируется', async () => {
        const store = usePublishStore();
        const first = buildPage({ id: 7, pagename: 'landing' });
        const second = buildPage({ id: 9, pagename: 'promo' });
        seedLoadedPages(store, [first, second]);

        // Присваивается синхронно в моке ниже — до первого использования
        let finishFirstRead!: (value: unknown) => void;

        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishFirstRead = resolve;
                })
        );
        // Копирование второй строки проходит целиком: чтение схемы и POST копии
        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 9, pagename: 'promo' }));
        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 10, pagename: 'promo-copy' }));

        const onNotify = vi.fn();
        const { duplicatePage, duplicatingPageIds } = usePublishPageActions({ onNotify });

        const firstCopy = duplicatePage(first);

        await duplicatePage(second);

        expect(onNotify).toHaveBeenCalledWith(
            'bricks.publish.dashboard.toasts.duplicated',
            'success'
        );
        expect(store.getPageById(10)?.pagename).toBe('promo-copy');
        expect(duplicatingPageIds.value.has('9')).toBe(false);

        // Занятость первой строки снимается своим ответом, а не ответом второй
        expect(duplicatingPageIds.value.has('7')).toBe(true);

        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 8, pagename: 'landing-copy' }));
        finishFirstRead(buildPage({ id: 7, pagename: 'landing' }));
        await firstCopy;

        expect(duplicatingPageIds.value.has('7')).toBe(false);
    });
});
