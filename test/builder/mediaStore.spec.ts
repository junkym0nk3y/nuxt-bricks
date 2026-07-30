// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
// #endregion

/**
 * Медиа-стор: отказ запроса не должен ни стирать уже показанный список, ни
 * молча выглядеть успехом, а поздний ответ — затирать локальную запись.
 */

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { useMediaStore } from '../../src/runtime/modules/builder/media/stores/media';

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

/**
 * Ошибка обрыва запроса по потолку ожидания — в той же форме, в какой её отдаёт
 * транспорт: имя в цепочке `cause`.
 *
 * @param message - Сообщение внешней ошибки.
 * @returns Ошибка, распознаваемая как обрыв по потолку.
 */
function buildTimeoutError(message: string): Error {
    const timeout = Object.assign(new Error('aborted due to timeout'), { name: 'TimeoutError' });

    return new Error(message, { cause: timeout });
}

describe('media store: доставка отказа и порядок ответов', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
    });

    it('отказ повторной загрузки не стирает уже показанный список', async () => {
        const store = useMediaStore();

        apiFetcherMock.mockResolvedValueOnce({ success: true, items: [buildItem()] });
        await store.loadItems();

        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        // Галерея открывается повторно: transient-отказ стирал бы то, что
        // успешно показывалось, — пользователь видел бы пустую библиотеку
        await expect(store.loadItems()).rejects.toThrow();
        expect(store.items).toHaveLength(1);
    });

    it('нераспознанная форма ответа — отказ, а не пустая галерея', async () => {
        const store = useMediaStore();

        apiFetcherMock.mockResolvedValueOnce({ success: true, items: [buildItem()] });
        await store.loadItems();

        for (const malformed of [{ success: false, items: [] }, {}, [buildItem()], null]) {
            apiFetcherMock.mockResolvedValueOnce(malformed);
            await expect(store.loadItems()).rejects.toThrow();
            expect(store.items).toHaveLength(1);
        }
    });

    it('ответ более раннего запроса не заменяет более свежий список', async () => {
        const store = useMediaStore();

        let resolveStale: ((response: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveStale = resolve;
                })
        );
        apiFetcherMock.mockResolvedValueOnce({
            success: true,
            items: [buildItem({ id: 2, filename: 'fresh.webp' })],
        });

        const stale = store.loadItems();
        await store.loadItems();

        resolveStale?.({ success: true, items: [buildItem({ id: 1, filename: 'stale.webp' })] });
        await stale;

        expect(store.items.map((item) => item.filename)).toEqual(['fresh.webp']);
    });

    it('отказ вытесненного запроса не доходит до вызывающего', async () => {
        const store = useMediaStore();

        let rejectStale: ((error: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    rejectStale = reject;
                })
        );
        apiFetcherMock.mockResolvedValueOnce({ success: true, items: [buildItem({ id: 5 })] });

        const stale = store.loadItems();
        await store.loadItems();

        // Тост об устаревшей попытке накрыл бы результат более свежей, которая
        // список уже показала
        rejectStale?.(new Error('503'));
        await expect(stale).resolves.toBeUndefined();
        expect(store.items.map((item) => item.id)).toEqual([5]);
    });

    it('локальная запись обесценивает уже летящий запрос списка', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1 }), buildItem({ id: 2 })];

        let resolveStale: ((response: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveStale = resolve;
                })
        );

        const stale = store.loadItems();

        // Удаление приземлилось, пока GET летел: его ответ об удалении не знает
        apiFetcherMock.mockResolvedValueOnce(undefined);
        await store.removeItem(2);

        resolveStale?.({
            success: true,
            items: [buildItem({ id: 1 }), buildItem({ id: 2 })],
        });
        await stale;

        expect(store.items.map((item) => item.id)).toEqual([1]);
    });

    it('индикатор загрузки снимается только после последней из параллельных', async () => {
        const store = useMediaStore();

        let resolveFirst: ((item: unknown) => void) | undefined;
        let resolveSecond: ((item: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                })
        );
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveSecond = resolve;
                })
        );

        const first = store.uploadFile(new File(['a'], 'a.webp', { type: 'image/webp' }));
        const second = store.uploadFile(new File(['b'], 'b.webp', { type: 'image/webp' }));

        expect(store.isUploading).toBe(true);

        resolveFirst?.(buildItem({ id: 10, filename: 'a.webp' }));
        await first;

        expect(store.isUploading).toBe(true);

        resolveSecond?.(buildItem({ id: 11, filename: 'b.webp' }));
        await second;

        expect(store.isUploading).toBe(false);
    });

    it('отказ смены категории пробрасывается, элемент не меняется', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1, category: 'photos' })];

        apiFetcherMock.mockRejectedValueOnce(new Error('500'));

        // Без проброса смена категории выглядела бы применённой
        await expect(store.updateItemCategory(1, 'icons')).rejects.toThrow();
        expect(store.items[0]?.category).toBe('photos');
    });

    it('ответ обновления пишет только поля своей операции', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1, category: 'photos', alt: '' })];

        // Смена категории и правка alt летят параллельно; сервер применил обе, но
        // ответ категории несёт ещё пустой alt — полная замена откатила бы правку
        apiFetcherMock.mockResolvedValueOnce(
            buildItem({ id: 1, category: 'photos', alt: 'sunset' })
        );
        await store.updateItemMeta(1, { alt: 'sunset' });

        apiFetcherMock.mockResolvedValueOnce(buildItem({ id: 1, category: 'icons', alt: '' }));
        await store.updateItemCategory(1, 'icons');

        expect(store.items[0]?.alt).toBe('sunset');
        expect(store.items[0]?.category).toBe('icons');
    });

    it('обновление приземляется в свой элемент, а не в занятый им индекс', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1 }), buildItem({ id: 2, category: 'photos' })];

        let resolvePatch: ((item: unknown) => void) | undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolvePatch = resolve;
                })
        );

        const patching = store.updateItemCategory(2, 'icons');

        // Пока PATCH летел, сосед удалён — индекс, снятый до запроса, теперь чужой
        apiFetcherMock.mockResolvedValueOnce(undefined);
        await store.removeItem(1);

        resolvePatch?.(buildItem({ id: 2, category: 'icons' }));
        await patching;

        expect(store.items.map((item) => [item.id, item.category])).toEqual([[2, 'icons']]);
    });

    it('обрыв удаления по потолку ожидания перечитывает список', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1 })];

        // Сервер мог успеть удалить файл: список нужно перечитать, иначе удалённый
        // остался бы в галерее, а повтор получил бы 404
        apiFetcherMock.mockRejectedValueOnce(
            buildTimeoutError('[DELETE] "/api/bricks/media/1/": <no response>')
        );
        apiFetcherMock.mockResolvedValueOnce({ success: true, items: [] });

        await expect(store.removeItem(1)).rejects.toThrow('bricks.common.writeTimeout');

        // Перечитывание отпущено, а не ожидается: сообщение об исходе доходит сразу
        await vi.waitFor(() => expect(store.items).toHaveLength(0));
    });

    it('остановка запроса лимитом БД доходит своим текстом, а не статусом транспорта', async () => {
        const store = useMediaStore();
        store.items = [buildItem({ id: 1 })];

        // Ответ ручки: 504 с машиночитаемым кодом. Без разбора кода пользователь
        // увидел бы англоязычный текст статуса, а список — обнулился бы вместе с
        // уже показанной галереей
        apiFetcherMock.mockRejectedValueOnce(
            Object.assign(new Error('[DELETE] "/api/bricks/media/1/": 504 Gateway Timeout'), {
                statusCode: 504,
                data: {
                    statusCode: 504,
                    statusMessage: 'Database statement timeout',
                    message: 'Database statement timeout',
                    data: { code: 'STATEMENT_TIMEOUT' },
                },
            })
        );

        await expect(store.removeItem(1)).rejects.toThrow('bricks.common.statementTimeout');
        expect(store.items).toHaveLength(1);
    });
});
