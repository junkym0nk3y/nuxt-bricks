// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { computed, effectScope, ref, type Ref } from 'vue';

// Types
import type { IUseBuilderPageSelectorReturn } from '../../src/runtime/modules/builder/app/types/composables';
import type { IBuilderSessionToken } from '../../src/runtime/modules/builder/app/types/session';
import type { IBricksPageAddress } from '../../src/runtime/modules/common/types/pageAddress';
import type { TShowToast } from '../../src/runtime/modules/builder/core/types/toast';

// Utils
import { bareAddress } from '../helpers/builderSessionHarness';
import { createPageBuilder } from '../helpers/publishFixtures';
// #endregion

// #region Mocks
const { routerMock, apiFetcherMock } = vi.hoisted(() => ({
    routerMock: { push: vi.fn(), replace: vi.fn() },
    apiFetcherMock: vi.fn(),
}));

vi.mock('#imports', async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
        ...original,
        useRoute: () => ({ name: 'bricks-builder-pagename', params: {} }),
        useRouter: () => routerMock,
    };
});

// Ключ вместе с параметрами: тексту тест не судья, а вот попала ли в сообщение
// нужная страница — проверяемое поведение
vi.mock('nuxt/app', () => ({
    // Композабл набора устройств читает runtimeConfig; пустой public даёт
    // дефолтный набор проекта — этого спекам импорта достаточно
    useRuntimeConfig: () => ({ public: {} }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key} ${JSON.stringify(params)}` : key,
    }),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { useBuilderPageSelector } from '../../src/runtime/modules/builder/app/composables/useBuilderPageSelector';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({});

/**
 * Токен сессии с ручной сменой поколения — тем же контрактом, что у билдера.
 *
 * @returns Заглушка токена сессии.
 */
function createSessionTokenStub(): IBuilderSessionToken {
    const generation = ref(0);

    return {
        token: computed(() => generation.value),
        capture: () => generation.value,
        isCurrent: (captured: number) => captured === generation.value,
        invalidate: () => {
            generation.value += 1;
        },
    };
}

describe('селектор страниц: переход и догрузка списка', () => {
    let showToastMock: Mock<TShowToast>;
    let routeAddress: Ref<IBricksPageAddress>;
    let sessionPageId: Ref<string | number | null>;
    let sessionToken: IBuilderSessionToken;

    beforeEach(() => {
        setActivePinia(createPinia());
        routerMock.push = vi.fn();
        apiFetcherMock.mockReset();
        apiFetcherMock.mockResolvedValue([]);
        showToastMock = vi.fn<TShowToast>();
        routeAddress = ref<IBricksPageAddress>(bareAddress('home'));
        sessionPageId = ref<string | number | null>(1);
        sessionToken = createSessionTokenStub();
    });

    /**
     * Поднимает composable в собственном scope — как это делает страница билдера.
     *
     * @returns Возвращаемое значение composable.
     */
    function mountSelector(): IUseBuilderPageSelectorReturn {
        const scope = effectScope();
        const selector = scope.run(() =>
            useBuilderPageSelector({
                sessionPageId,
                routeAddress: computed(() => routeAddress.value),
                sessionToken,
                showToast: showToastMock,
            })
        );

        return selector as IUseBuilderPageSelectorReturn;
    }

    it('выбор открытой страницы не запускает навигацию', async () => {
        const selector = mountSelector();

        await selector.handleSelectPage(buildPage({ id: 1, pagename: 'home' }));

        expect(routerMock.push).not.toHaveBeenCalled();
        expect(showToastMock).not.toHaveBeenCalled();
    });

    it('выбор другой страницы уводит на её маршрут', async () => {
        const selector = mountSelector();

        await selector.handleSelectPage(buildPage({ id: 2, pagename: 'about' }));

        expect(routerMock.push).toHaveBeenCalledWith({
            name: 'bricks-builder-pagename',
            params: { pagename: 'about' },
        });
    });

    it('одноимённая страница под другим префиксом — обычный переход, а не «та же»', async () => {
        const selector = mountSelector();

        await selector.handleSelectPage(buildPage({ id: 2, pagename: 'home', urlPrefix: 'blog' }));

        // Сравнение по имени приняло бы её за открытую страницу и показало бы
        // сообщение о подмене вместо перехода
        expect(showToastMock).not.toHaveBeenCalled();
        expect(routerMock.push).toHaveBeenCalledWith({
            name: 'bricks-builder-pagename-prefixed',
            params: { pagename: 'home', urlPrefix: ['blog'] },
        });
    });

    it('страница по тому же адресу, но с другим id, не подменяет содержимое молча', async () => {
        const selector = mountSelector();

        // Страницу удалили и создали заново в соседней вкладке. Переоткрыть сессию
        // здесь нельзя: маршрут прежний, значит синхронный сброс черновика не
        // сработает, а bootstrap удалит запись как принадлежащую прежней странице —
        // и единственная копия несохранённых правок исчезнет
        await selector.handleSelectPage(buildPage({ id: 20, pagename: 'home' }));

        expect(routerMock.push).not.toHaveBeenCalled();
        expect(showToastMock).toHaveBeenCalledWith(
            expect.stringContaining('home'),
            'error',
            expect.any(Number)
        );
    });

    it('созданная страница не уводит с той, куда пользователь ушёл во время создания', async () => {
        const selector = mountSelector();

        selector.handleOpenCreatePage();
        // Переход на другую страницу билдера, пока модалка ждала ответа сервера
        sessionToken.invalidate();

        await selector.handlePageCreated(bareAddress('fresh-page'));

        expect(routerMock.push).not.toHaveBeenCalled();
        expect(selector.isCreatePageModalOpen.value).toBe(false);
        expect(showToastMock).toHaveBeenCalledWith(
            expect.stringContaining('fresh-page'),
            'success'
        );
    });

    it('созданная страница открывается в редакторе, если сессия не менялась', async () => {
        const selector = mountSelector();

        selector.handleOpenCreatePage();
        await selector.handlePageCreated(bareAddress('fresh-page'));

        expect(routerMock.push).toHaveBeenCalledWith({
            name: 'bricks-builder-pagename',
            params: { pagename: 'fresh-page' },
        });
    });

    it('созданная страница с префиксом открывается на prefixed-маршруте редактора', async () => {
        const selector = mountSelector();

        selector.handleOpenCreatePage();
        await selector.handlePageCreated({ pagename: 'post', urlPrefix: 'blog' });

        // Bare-маршрут открыл бы `<builderPrefix>/post` — либо чужую одноимённую
        // страницу, либо пустую форму новой
        expect(routerMock.push).toHaveBeenCalledWith({
            name: 'bricks-builder-pagename-prefixed',
            params: { pagename: 'post', urlPrefix: ['blog'] },
        });
    });

    it('первое открытие догружает список, следующие — освежают его', async () => {
        const selector = mountSelector();
        const publishStore = usePublishStore();

        await selector.handleOpenPageSelector();
        expect(publishStore.pagesLoadedAt).not.toBeNull();
        expect(apiFetcherMock).toHaveBeenCalledTimes(1);

        await selector.handleOpenPageSelector();
        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
    });

    it('отказ освежения оставляет прежний список и не поднимает ошибку наружу', async () => {
        const selector = mountSelector();
        const publishStore = usePublishStore();

        publishStore.publishedPages = [buildPage({ id: 1, pagename: 'home' })];
        publishStore.pagesLoadedAt = 1;
        apiFetcherMock.mockRejectedValue(new Error('Network down'));

        await expect(selector.handleOpenPageSelector()).resolves.toBeUndefined();

        expect(publishStore.publishedPages.map((page) => page.pagename)).toEqual(['home']);
        expect(publishStore.generalError).toBe('');
        expect(selector.isPagesRefreshing.value).toBe(false);
    });
});
