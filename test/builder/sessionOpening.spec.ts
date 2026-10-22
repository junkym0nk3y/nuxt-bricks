// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { nextTick, reactive, type EffectScope } from 'vue';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';
import type { IBuilderContext, IDeferredApi } from '../helpers/types';

// Utils
import {
    ADDRESS_SYNC_DEBOUNCE_MS,
    bareAddress,
    createDeferredApi,
    createWindowStub,
    mountBuilderContext,
} from '../helpers/builderSessionHarness';
import { createPageBuilder, seedLoadedPages } from '../helpers/publishFixtures';
// #endregion

// #region Mocks
/**
 * Мост route/router для стаба `#imports` (см. test/builder/pagenameSession.spec.ts) —
 * тот же паттерн: hoisted-объект читается фабрикой мока лениво.
 */
const { routerBridge, apiFetcherMock } = vi.hoisted(() => ({
    routerBridge: {
        route: { name: '' as string | undefined, params: {} as Record<string, string> },
        replace: vi.fn(),
    },
    apiFetcherMock: vi.fn(),
}));

vi.mock('#imports', async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();
    const stubRouter = (original.useRouter as () => Record<string, unknown>)();
    return {
        ...original,
        useRoute: () => routerBridge.route,
        useRouter: () => ({ ...stubRouter, replace: routerBridge.replace }),
    };
});

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({
    description: 'Landing page',
    keywords: 'landing',
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-30T10:00:00Z',
});

/**
 * Компонент канваса с узнаваемым id — по нему тест отличает, чья схема осталась
 * на канвасе после гонки открытий.
 *
 * @param id - Идентификатор компонента.
 * @returns Компонент схемы страницы.
 */
function buildComponent(id: string): IBricksComponent {
    return {
        id,
        type: 'component',
        componentName: 'Text',
        brickPath: '/components/Text.brick.ts',
        zIndex: 1,
        props: { text: id },
    };
}

/**
 * Страница со схемой из одного узнаваемого компонента.
 *
 * @param id - Идентификатор страницы.
 * @param pagename - ЧПУ страницы.
 * @param componentId - Идентификатор единственного компонента схемы.
 * @returns Страница для списка стора и point-lookup'а.
 */
function buildPageWithComponent(id: number, pagename: string, componentId: string): IPublishedPage {
    return buildPage({
        id,
        pagename,
        title: `Page ${componentId}`,
        schema: { components: [buildComponent(componentId)] },
    });
}

// app/composables/useBuilderSession.ts, SESSION_BOOTSTRAP_TIMEOUT_MS
const SESSION_BOOTSTRAP_TIMEOUT_MS = 30000;

describe('открытие сессии билдера: гонка переключений и отказ bootstrap’а', () => {
    let activeScopes: EffectScope[] = [];
    let deferred: IDeferredApi;
    // url'ы, ответ на которые держит сам тест; остальные отвечают сразу из serverPages
    let deferredUrls: string[] = [];
    let serverPages: IPublishedPage[] = [];

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal('window', createWindowStub());
        vi.useFakeTimers();

        routerBridge.route = reactive({
            name: 'bricks-builder-pagename',
            params: { pagename: 'page-a' },
        });
        routerBridge.replace = vi.fn();

        deferred = createDeferredApi();
        deferredUrls = [];
        serverPages = [];
        apiFetcherMock.mockReset();
        apiFetcherMock.mockImplementation((url: unknown) => {
            const requested = String(url);

            if (deferredUrls.includes(requested)) {
                return deferred.handle(requested);
            }

            const idMatch = /^\/api\/bricks\/(\d+)\/$/.exec(requested);
            if (idMatch) {
                return Promise.resolve(
                    serverPages.find((page) => String(page.id) === idMatch[1]) ?? null
                );
            }

            return Promise.resolve(serverPages);
        });
        activeScopes = [];
    });

    afterEach(() => {
        activeScopes.forEach((scope) => scope.stop());
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    /**
     * Поднимает контекст и регистрирует scope для очистки в afterEach.
     */
    function mountTracked(): IBuilderContext {
        const context = mountBuilderContext();
        activeScopes.push(context.scope);
        return context;
    }

    it('поздняя схема вытесненного открытия не попадает на канвас', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        const pageB = buildPageWithComponent(2, 'page-b', 'b1');
        // Список прогрет: гонка остаётся только на point-lookup'е схемы
        seedLoadedPages(publishStore, [pageA, pageB]);
        serverPages = [pageA, pageB];
        deferredUrls = ['/api/bricks/1/', '/api/bricks/2/'];

        // Второе открытие — после того как первое дошло до запроса схемы: до него
        // вытесненное открытие выходит само, увидев чужое поколение
        const openingA = context.session.openBuilderSession(bareAddress('page-a'));
        const schemaForA = await deferred.waitFor('/api/bricks/1/');
        const openingB = context.session.openBuilderSession(bareAddress('page-b'));

        // Ответы в обратном порядке: актуальное открытие доезжает первым, вытесненное — после
        (await deferred.waitFor('/api/bricks/2/')).resolve(pageB);
        await openingB;
        schemaForA.resolve(pageA);
        await openingA;

        expect(context.address.sessionAddress.value).toEqual(bareAddress('page-b'));
        expect(publishStore.editingPageId).toBe(2);
        expect(publishStore.currentFormState.pagename).toBe('page-b');
        expect(componentsStore.components.map((component) => component.id)).toEqual(['b1']);
        expect(context.session.isSessionReady.value).toBe(true);
    });

    it('общий запрос списка не переводит стор на страницу вытесненного открытия', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        const pageB = buildPageWithComponent(2, 'page-b', 'b1');
        serverPages = [pageA, pageB];
        // Список страниц не загружен — bootstrap начинается с его запроса
        deferredUrls = ['/api/bricks/'];

        const openingA = context.session.openBuilderSession(bareAddress('page-a'));
        const openingB = context.session.openBuilderSession(bareAddress('page-b'));

        // Запрос один на оба открытия: список — общий кеш, и второе открытие ждёт
        // уже летящий запрос вместо своего
        expect(deferred.pending).toHaveLength(1);

        (await deferred.waitFor('/api/bricks/')).resolve([pageA, pageB]);
        await Promise.all([openingA, openingB]);

        expect(publishStore.editingPageId).toBe(2);
        expect(publishStore.currentFormState.pagename).toBe('page-b');
        expect(componentsStore.components.map((component) => component.id)).toEqual(['b1']);
    });

    it('ошибка вытесненного открытия не гасит лоадер и не доходит до пользователя', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        const pageB = buildPageWithComponent(2, 'page-b', 'b1');
        seedLoadedPages(publishStore, [pageA, pageB]);
        serverPages = [pageA, pageB];
        deferredUrls = ['/api/bricks/1/', '/api/bricks/2/'];

        const openingA = context.session.openBuilderSession(bareAddress('page-a'));
        const schemaForA = await deferred.waitFor('/api/bricks/1/');
        const openingB = context.session.openBuilderSession(bareAddress('page-b'));

        schemaForA.reject(new Error('Network down'));
        await openingA;

        expect(context.showToastMock).not.toHaveBeenCalled();
        // Блокирующий экран не поднимается: страница на экране грузится своим поколением
        expect(context.session.sessionError.value).toBeNull();
        expect(context.session.isSessionLoading.value).toBe(true);
        expect(context.session.isSessionReady.value).toBe(false);

        (await deferred.waitFor('/api/bricks/2/')).resolve(pageB);
        await openingB;

        expect(context.session.isSessionReady.value).toBe(true);
        expect(context.session.isSessionLoading.value).toBe(false);
    });

    it('отказ bootstrap’а поднимает блокирующее состояние с причиной', async () => {
        const context = mountTracked();
        apiFetcherMock.mockRejectedValue(new Error('Network down'));

        await context.session.openBuilderSession(bareAddress('page-a'));

        // Редактор без этого состояния выглядит рабочим, хотя автосейв отклоняет
        // всё по !isSessionReady — правки терялись молча
        expect(context.session.sessionError.value).toContain('Network down');
        expect(context.session.isSessionReady.value).toBe(false);
        expect(context.session.isSessionLoading.value).toBe(false);
    });

    it('поздний ответ покинутой страницы не пишет в сторы новой сессии', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        const pageB = buildPageWithComponent(2, 'page-b', 'b1');
        seedLoadedPages(publishStore, [pageA, pageB]);
        serverPages = [pageA, pageB];
        deferredUrls = ['/api/bricks/1/'];

        const openingA = context.session.openBuilderSession(bareAddress('page-a'));
        const schemaForA = await deferred.waitFor('/api/bricks/1/');

        // Уход на дашборд: страница билдера размонтирована, но запрос схемы летит,
        // а сторы живут на уровне приложения
        context.scope.stop();

        // Возврат в редактор другой страницы — новый экземпляр composables, те же сторы
        const reopened = mountTracked();
        await reopened.session.openBuilderSession(bareAddress('page-b'));

        schemaForA.resolve(pageA);
        await openingA;

        expect(componentsStore.components.map((component) => component.id)).toEqual(['b1']);
        expect(publishStore.editingPageId).toBe(2);
    });

    it('открытие другой страницы забывает незавершённую запись прежней', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        const pageB = buildPageWithComponent(2, 'page-b', 'b1');
        seedLoadedPages(publishStore, [pageA, pageB]);
        serverPages = [pageA, pageB];
        await context.session.openBuilderSession(bareAddress('page-a'));

        // Сохранение страницы A: PUT ушёл и ответа ещё нет
        deferredUrls = ['/api/bricks/1/'];
        const savingA = publishStore.publishCurrentPage({ components: [] });
        const savingRequest = await deferred.waitFor('/api/bricks/1/');
        expect(publishStore.isSubmitting).toBe(true);

        // Переход на другую страницу: незавершённая запись A перестаёт быть
        // «записью текущей страницы» — иначе B открылась бы с заблокированным
        // сохранением и индикатором чужой операции
        deferredUrls = [];
        await context.session.openBuilderSession(bareAddress('page-b'));

        expect(publishStore.isSubmitting).toBe(false);

        // Запрос A всё ещё летит; его завершение к состоянию B отношения не имеет
        savingRequest.resolve(pageA);
        await savingA;

        expect(publishStore.isSubmitting).toBe(false);
        expect(publishStore.editingPageId).toBe(2);
    });

    it('переименование не переносит сессию, пока открытие не завершено', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        serverPages = [pageA];
        deferredUrls = ['/api/bricks/'];

        const opening = context.session.openBuilderSession(bareAddress('page-a'));

        // Правка pagename в сайдбаре, пока список ещё грузится: лоадер закрывает
        // только канвас и прячется через один цикл анимации, панели интерактивны.
        // Перенос сессии здесь менял бы ключ и URL, не трогая поколение, — и
        // незавершённый bootstrap применил бы прежнюю страницу под новым ключом
        publishStore.setCurrentFormField('pagename', 'typed-name');
        await nextTick();
        await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DEBOUNCE_MS);

        expect(routerBridge.replace).not.toHaveBeenCalled();
        expect(context.address.sessionAddress.value).toEqual(bareAddress('page-a'));

        (await deferred.waitFor('/api/bricks/')).resolve([pageA]);
        await opening;
        expect(publishStore.editingPageId).toBe(1);
    });

    it('зависшее открытие не оставляет рабочую область закрытой навсегда', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        serverPages = [pageA];
        // Запрос списка не отвечает и не падает: catch/finally недостижимы, лоадер
        // прячется сам через один цикл анимации — без таймаута щит остался бы навсегда
        deferredUrls = ['/api/bricks/'];

        const opening = context.session.openBuilderSession(bareAddress('page-a'));
        await vi.advanceTimersByTimeAsync(SESSION_BOOTSTRAP_TIMEOUT_MS);
        await opening;

        expect(context.session.sessionError.value).not.toBeNull();
        expect(context.session.isSessionLoading.value).toBe(false);
        expect(context.session.isSessionReady.value).toBe(false);

        // Ответ, доехавший после отказа, ничего не применяет: брошенное открытие
        // погашено поколением, иначе схема легла бы поверх экрана ошибки
        (await deferred.waitFor('/api/bricks/')).resolve([pageA]);

        // Догоняем цепочку брошенного открытия: она продолжается с того же await,
        // и без гашения поколения дошла бы до startEditingPage и загрузки схемы
        await vi.advanceTimersByTimeAsync(0);
        await nextTick();

        expect(publishStore.editingPageId).toBeNull();
        expect(context.session.isSessionReady.value).toBe(false);
    });

    it('повторная попытка снимает состояние ошибки и открывает страницу', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        serverPages = [pageA];
        // Падает только первый запрос списка, дальше сервер отвечает штатно
        apiFetcherMock.mockRejectedValueOnce(new Error('Network down'));

        await context.session.openBuilderSession(bareAddress('page-a'));
        expect(context.session.sessionError.value).not.toBeNull();

        await context.session.retryBuilderSession();

        expect(context.session.sessionError.value).toBeNull();
        expect(context.session.isSessionReady.value).toBe(true);
        expect(publishStore.editingPageId).toBe(1);
        expect(componentsStore.components.map((component) => component.id)).toEqual(['a1']);
    });
});
