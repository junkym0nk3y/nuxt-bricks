// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Utils
import { createPageBuilder } from '../helpers/publishFixtures';
// #endregion

/**
 * Список дашборда грузился из `onMounted`, то есть SSR-разметка уезжала
 * пользователю с пустым списком: до ответа ручки он видел не спиннер, а пустое
 * состояние «страниц пока нет». Здесь проверяется загрузка через
 * `useAsyncData` — вместе с двумя её краями: готовый ответ в payload не должен
 * порождать второй запрос, а деградировавший SSR-прогон обязан чиниться ровно
 * одним повтором с клиента.
 */

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

const asyncDataMode: { cachedData?: unknown } = {};

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const { createUseAsyncDataStub } = await import('../helpers/asyncData');

    return {
        ...actual,
        useAsyncData: (key: string, handler: () => Promise<unknown>) =>
            createUseAsyncDataStub(asyncDataMode.cachedData)(key, handler),
    };
});

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { usePublishPagesData } from '../../src/runtime/modules/builder/publish/composables/usePublishPagesData';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';
import { resetNuxtReadyStub, runNuxtReadyCallbacks } from '../stubs/nuxt-imports';

const buildPage = createPageBuilder({ socialImage: '' });

describe('список страниц дашборда: загрузка запросом с сервера', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetNuxtReadyStub();
        asyncDataMode.cachedData = undefined;
        apiFetcherMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('загруженный список ложится в стор, а спиннер снимается', async () => {
        apiFetcherMock.mockResolvedValueOnce([buildPage({ id: 1, pagename: 'landing' })]);

        const onLoadFailed = vi.fn();
        const { isLoadingPages } = await usePublishPagesData({ onLoadFailed });

        // На клиенте композабл ответа не ждёт: ожидание задержало бы переход из
        // билдера в дашборд, и вместо спиннера в списке пользователь смотрел бы
        // на замерший билдер (на сервере ожидание есть — иначе разметка первого
        // кадра уедет с пустым списком)
        expect(isLoadingPages.value).toBe(true);

        // Стор — единственный источник списка: из него же его берёт bootstrap
        // сессии билдера, и второй копии в композабле быть не должно
        await vi.waitFor(() => expect(isLoadingPages.value).toBe(false));
        expect(usePublishStore().publishedPages.map((page) => page.pagename)).toEqual(['landing']);
        expect(onLoadFailed).not.toHaveBeenCalled();
    });

    it('готовый ответ из payload не порождает второго запроса', async () => {
        // Так выглядит гидрация после удачного SSR-прогона: в payload
        // `useAsyncData` лежит только маркер полноты, а сам список приезжает
        // состоянием сторов Pinia — его здесь и изображает заполненный стор
        asyncDataMode.cachedData = { isPartial: false };
        usePublishStore().publishedPages = [buildPage({ id: 1, pagename: 'landing' })];

        const { isLoadingPages } = await usePublishPagesData({ onLoadFailed: vi.fn() });

        runNuxtReadyCallbacks();

        // На гидрации handler не исполняется: запрос здесь означал бы два
        // запроса на один заход в дашборд — ровно то, чего эта загрузка избегает
        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(isLoadingPages.value).toBe(false);

        // И список остаётся тем, что пришёл с сервера: композабл не сбрасывает
        // стор в пустой при живом маркере
        expect(usePublishStore().publishedPages.map((page) => page.pagename)).toEqual(['landing']);
    });

    it('отказ загрузки на клиенте докладывается тостом, а не молчанием', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        const onLoadFailed = vi.fn();
        const { isLoadingPages } = await usePublishPagesData({ onLoadFailed });

        await vi.waitFor(() => expect(onLoadFailed).toHaveBeenCalledTimes(1));
        expect(isLoadingPages.value).toBe(false);
    });

    it('деградировавший SSR-прогон держит спиннер и чинится повтором с клиента', async () => {
        // Так выглядит гидрация после отказа на сервере: ошибка в payload не
        // едет (иначе Nuxt пропустил бы первый запрос), едет маркер неполноты
        asyncDataMode.cachedData = { isPartial: true };

        const onLoadFailed = vi.fn();
        const { isLoadingPages } = await usePublishPagesData({ onLoadFailed });

        // Пустое состояние «страниц пока нет» здесь было бы утверждением о
        // списке, которого никто не читал
        expect(isLoadingPages.value).toBe(true);

        apiFetcherMock.mockResolvedValueOnce([buildPage({ id: 2, pagename: 'restored' })]);
        runNuxtReadyCallbacks();
        await vi.waitFor(() => expect(isLoadingPages.value).toBe(false));

        expect(usePublishStore().publishedPages.map((page) => page.pagename)).toEqual(['restored']);
        expect(onLoadFailed).not.toHaveBeenCalled();
    });

    it('восстановление уходит ровно один раз', async () => {
        asyncDataMode.cachedData = { isPartial: true };

        await usePublishPagesData({ onLoadFailed: vi.fn() });

        apiFetcherMock.mockResolvedValue([buildPage({ id: 3, pagename: 'restored' })]);
        runNuxtReadyCallbacks();
        runNuxtReadyCallbacks();
        await vi.waitFor(() => expect(apiFetcherMock).toHaveBeenCalled());

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
    });

    it('неудачное восстановление снимает спиннер и докладывает об отказе', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        asyncDataMode.cachedData = { isPartial: true };

        const onLoadFailed = vi.fn();
        const { isLoadingPages } = await usePublishPagesData({ onLoadFailed });

        apiFetcherMock.mockRejectedValueOnce(new Error('503'));
        runNuxtReadyCallbacks();

        // Иначе спиннер остался бы крутиться навсегда: повтор один, и после
        // него пользователю нужно видеть состояние списка, а не ожидание
        await vi.waitFor(() => expect(isLoadingPages.value).toBe(false));
        expect(onLoadFailed).toHaveBeenCalledTimes(1);
    });
});
