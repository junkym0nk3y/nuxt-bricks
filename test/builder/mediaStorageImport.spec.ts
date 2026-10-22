// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
// #endregion

/**
 * Импорт содержимого бакета в медиатеку.
 *
 * Прежде им занималась сама ручка списка при пустой таблице, то есть GET писал
 * в БД: безопасные методы проходят мимо CSRF-гейта, и запись досталась бы роли,
 * которой разрешено только чтение. Теперь это отдельный POST, а стор зовёт его
 * при пустом списке — прежнее поведение галереи сохранено.
 */

// #region Mocks
const { apiFetcherMock, nuxtContext } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    // The app context, which on the server ends at the first await
    nuxtContext: { isGone: false },
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => {
        if (nuxtContext.isGone) {
            throw new Error(
                'A composable that requires access to the Nuxt instance was called outside of a plugin, Nuxt hook, Nuxt middleware, or Vue setup function.'
            );
        }

        return { apiFetcher: apiFetcherMock };
    },
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
 * Отбирает пути, по которым ходил стор.
 *
 * @returns Список запрошенных путей в порядке вызовов.
 */
function requestedPaths(): string[] {
    return apiFetcherMock.mock.calls.map((call) => String(call[0]));
}

describe('media store: импорт хранилища при пустом списке', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
        nuxtContext.isGone = false;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('зовёт импорт, когда список пуст, и показывает то, что он вернул', async () => {
        apiFetcherMock
            .mockResolvedValueOnce({ success: true, items: [] })
            .mockResolvedValueOnce({ success: true, items: [buildItem()] });

        const store = useMediaStore();
        await store.loadItems();

        expect(requestedPaths()).toEqual(['/api/bricks/media/', '/api/bricks/media/import']);
        expect(store.items).toHaveLength(1);
        expect(store.hasLoadedItemsSnapshot).toBe(true);
    });

    it('обход хранилища идёт с клиентом вызывающего, а не берёт свой после await', async () => {
        // An empty library is the first run of an integrator: the walk over the storage is
        // the only way to fill the gallery. On the server the app context ends at the first
        // await, and a second useApiClient() inside the action threw
        apiFetcherMock
            .mockImplementationOnce(() => {
                nuxtContext.isGone = true;
                return Promise.resolve({ success: true, items: [] });
            })
            .mockResolvedValueOnce({ success: true, items: [buildItem()] });

        const store = useMediaStore();
        await store.loadItems();

        expect(requestedPaths()).toEqual(['/api/bricks/media/', '/api/bricks/media/import']);
        expect(store.items).toHaveLength(1);
    });

    it('не зовёт импорт, когда файлы уже есть', async () => {
        apiFetcherMock.mockResolvedValueOnce({ success: true, items: [buildItem()] });

        const store = useMediaStore();
        await store.loadItems();

        expect(requestedPaths()).toEqual(['/api/bricks/media/']);
    });

    it('обходит весь префикс хранилища не чаще раза за сессию', async () => {
        apiFetcherMock.mockResolvedValue({ success: true, items: [] });

        const store = useMediaStore();
        await store.loadItems();
        await store.loadItems();

        expect(requestedPaths().filter((path) => path.endsWith('/import'))).toHaveLength(1);
    });

    it('не теряет результат импорта, если список перезапрошен, пока импорт летит', async () => {
        let releaseImport: (value: { success: boolean; items: IMediaItem[] }) => void = () =>
            undefined;
        const importResponse = new Promise<{ success: boolean; items: IMediaItem[] }>((resolve) => {
            releaseImport = resolve;
        });

        apiFetcherMock.mockImplementation((path: string) =>
            String(path).endsWith('/import')
                ? importResponse
                : Promise.resolve({ success: true, items: [] })
        );

        const store = useMediaStore();
        const first = store.loadItems();

        // Второй запрос уходит, когда импорт первого уже летит. Именно этот
        // порядок и опасен: более ранний вызов отсекается проверкой устаревания
        // только ПОСЛЕ импорта, поэтому обход хранилища успевает начаться
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
        const second = store.loadItems();

        releaseImport({ success: true, items: [buildItem()] });
        await Promise.all([first, second]);

        // Второй вызов не должен объявлять галерею пустой: он становится
        // последним запросом, и ответ уже успешного импорта иначе отбрасывается
        // как устаревший — файлы импортированы, а галерея пуста
        expect(requestedPaths().filter((path) => path.endsWith('/import'))).toHaveLength(1);
        expect(store.items).toHaveLength(1);
    });

    it('оставляет галерею работоспособной, когда прав на импорт нет, и не повторяет запрещённый запрос', async () => {
        apiFetcherMock
            .mockResolvedValueOnce({ success: true, items: [] })
            .mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
            .mockResolvedValue({ success: true, items: [] });

        const store = useMediaStore();

        // 403 у наблюдателя и редактора — штатный исход служебной операции:
        // отказ не должен превращаться в отказ загрузки галереи
        await expect(store.loadItems()).resolves.toBeUndefined();
        expect(store.items).toEqual([]);
        expect(store.hasLoadedItemsSnapshot).toBe(true);

        // Прав не появится, сколько ни открывай галерею
        await store.loadItems();
        expect(requestedPaths().filter((path) => path.endsWith('/import'))).toHaveLength(1);
    });

    it('повторяет импорт после временного отказа', async () => {
        apiFetcherMock
            .mockResolvedValueOnce({ success: true, items: [] })
            .mockRejectedValueOnce(
                Object.assign(new Error('Service Unavailable'), { statusCode: 503 })
            )
            .mockResolvedValueOnce({ success: true, items: [] })
            .mockResolvedValueOnce({ success: true, items: [buildItem()] });

        const store = useMediaStore();

        // Недоступное хранилище — не «импортировать было нечего»: запомни
        // сетевой сбой как выполненную попытку, и администратор остался бы с
        // пустой галереей до перезагрузки страницы
        await store.loadItems();
        expect(store.items).toEqual([]);

        await store.loadItems();
        expect(requestedPaths().filter((path) => path.endsWith('/import'))).toHaveLength(2);
        expect(store.items).toHaveLength(1);
    });
});
