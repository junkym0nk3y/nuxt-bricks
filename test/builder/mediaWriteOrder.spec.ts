// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
// #endregion

/**
 * Порядок применения ЗАПИСЕЙ медиа-стора. У чтений номер запроса есть
 * (`itemsRequestId`), а у PATCH'ей его не было: поздний ответ раннего запроса
 * кладёт в стор значение, которое пользователь уже перебил.
 */

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { useMediaStore } from '../../src/runtime/modules/builder/media/stores/media';
import { useMediaWriteOrderStore } from '../../src/runtime/modules/builder/media/stores/mediaWriteOrder';

/**
 * Собирает медиа-элемент ответа ручки.
 *
 * @param overrides - Переопределяемые поля элемента.
 * @returns Элемент медиа-библиотеки.
 */
function buildItem(overrides: Partial<IMediaItem> = {}): IMediaItem {
    return {
        id: 1,
        filename: 'photo.webp',
        url: '/bricks-media/photo.webp',
        alt: '',
        category: 'photos',
        mimeType: 'image/webp',
        size: 1024,
        ...overrides,
    } as IMediaItem;
}

describe('media store: порядок ответов записи', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
    });

    it('поздний ответ раннего PATCH не возвращает перебитое значение поля', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1, alt: '' })];

        let resolveStale: ((item: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveStale = resolve;
                })
        );
        apiFetcherMock.mockResolvedValueOnce(buildItem({ id: 1, alt: 'вторая правка' }));

        // Два быстрых `focusout` по одному полю: ответы вправе разъехаться
        const stale = store.updateItemMeta(1, { alt: 'первая правка' });
        await store.updateItemMeta(1, { alt: 'вторая правка' });

        resolveStale?.(buildItem({ id: 1, alt: 'первая правка' }));
        await stale;

        expect(store.items[0]?.alt).toBe('вторая правка');
    });

    it('устаревшая правка одного поля не глушит ответ по соседнему', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1, filename: 'photo.webp', alt: '' })];

        let resolveFilename: ((item: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFilename = resolve;
                })
        );
        apiFetcherMock.mockResolvedValueOnce(buildItem({ id: 1, alt: 'закат' }));

        // Переименование и alt — независимые PATCH'и: номер записи ведётся по
        // полю, иначе правка alt отменяла бы применение переименования
        const renaming = store.updateItemMeta(1, { filename: 'sunset.webp' });
        await store.updateItemMeta(1, { alt: 'закат' });

        resolveFilename?.(buildItem({ id: 1, filename: 'sunset.webp' }));
        await renaming;

        expect(store.items[0]?.filename).toBe('sunset.webp');
        expect(store.items[0]?.alt).toBe('закат');
    });

    it('удаление категории обесценивает летящую смену категории', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1, category: null })];

        let resolvePatch: ((item: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolvePatch = resolve;
                })
        );

        const patching = store.updateItemCategory(1, 'promo');
        // Категорию удалили, пока PATCH летел: сервер снял её со своих файлов
        store.clearCategoryLocally('promo');

        resolvePatch?.(buildItem({ id: 1, category: 'promo' }));
        await patching;

        // Локально элемент помнил бы удалённую категорию, которой нет ни в ряду
        // чипов, ни в базе
        expect(store.items[0]?.category).toBeNull();
    });

    it('удаление ОДНОЙ категории не глушит назначение другой', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1, category: null })];

        let resolvePatch: ((item: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolvePatch = resolve;
                })
        );

        const patching = store.updateItemCategory(1, 'photos');
        // Удалили «Промо», пока летело назначение «Фото»: к этому PATCH'у
        // удаление отношения не имеет
        store.clearCategoryLocally('promo');

        resolvePatch?.(buildItem({ id: 1, category: 'photos' }));
        await patching;

        expect(store.items[0]?.category).toBe('photos');
    });

    it('номера записей удалённого элемента не копятся', async () => {
        const store = useMediaStore();
        const writeOrder = useMediaWriteOrderStore();
        store.items = [buildItem({ id: 1 })];

        apiFetcherMock.mockResolvedValueOnce(buildItem({ id: 1, alt: 'закат' }));
        await store.updateItemMeta(1, { alt: 'закат' });

        expect(Object.keys(writeOrder.itemWriteIds)).toEqual(['1:alt']);

        apiFetcherMock.mockResolvedValueOnce(undefined);
        await store.removeItem(1);

        expect(writeOrder.itemWriteIds).toEqual({});
    });

    it('успех старой записи после отказа новой досверяется с сервером', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1, alt: '' })];

        let resolveEarly: ((item: unknown) => void) | undefined;
        let rejectLate: ((error: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveEarly = resolve;
                })
        );
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    rejectLate = reject;
                })
        );

        const early = store.updateItemMeta(1, { alt: 'первая правка' });
        const late = store.updateItemMeta(1, { alt: 'вторая правка' });

        // Поздняя отказала — её значение сервер не сохранил; ранняя удалась, но
        // считается устаревшей по порядку старта, и её ответ не применяется
        rejectLate?.(new Error('400'));
        await expect(late).rejects.toThrow();

        // Пока ранняя в полёте, сверки быть не должно: GET обогнал бы её PATCH
        expect(apiFetcherMock).toHaveBeenCalledTimes(2);

        apiFetcherMock.mockResolvedValueOnce({
            success: true,
            items: [buildItem({ id: 1, alt: 'первая правка' })],
        });
        resolveEarly?.(buildItem({ id: 1, alt: 'первая правка' }));
        await early;

        // Сверка отпущена после тишины по элементу и приводит стор к серверу
        await vi.waitFor(() => expect(store.items[0]?.alt).toBe('первая правка'));
    });
});
