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
    createDeferredApi,
    createWindowStub,
    mountBuilderContext,
} from '../helpers/builderSessionHarness';
import { createPageBuilder } from '../helpers/publishFixtures';
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
    return {
        ...original,
        useRoute: () => routerBridge.route,
        useRouter: () => ({ replace: routerBridge.replace }),
    };
});

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import {
    getBuilderDraft,
    setBuilderDraft,
} from '../../src/runtime/modules/builder/publish/utils/draftStorage';
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

describe('модалка восстановления черновика: согласованность сессии', () => {
    let activeScopes: EffectScope[] = [];
    let deferred: IDeferredApi;
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

    it('модалка восстановления черновика держит сессию несогласованной', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];

        // Черновик той же страницы с другим содержимым — bootstrap предложит восстановить
        setBuilderDraft({
            pagename: 'page-a',
            updatedAt: '2026-07-28T10:00:00.000Z',
            mode: 'edit',
            pageId: 1,
            draftSnapshot: {
                schema: { components: [buildComponent('draft-1')] },
                formState: { ...publishStore.currentFormState, pagename: 'page-a' },
            },
        });

        await context.session.openBuilderSession('page-a');

        // Пока ответа нет, на канвасе сохранённая версия, а автосейв всё отклоняет
        // по isRestoreDraftModalOpen: с поднятой готовностью правка с клавиатуры
        // (глобальный Ctrl+V) прошла бы guard и потерялась молча
        expect(context.session.isRestoreDraftModalOpen.value).toBe(true);
        expect(context.session.isSessionReady.value).toBe(false);
        // До ответа на канвасе сохранённая версия
        expect(componentsStore.components.map((component) => component.id)).toEqual(['a1']);

        context.session.handleRestoreDraft();

        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(context.session.isSessionReady.value).toBe(true);
        expect(componentsStore.components.map((component) => component.id)).toEqual(['draft-1']);
    });
    it('отказ от восстановления тоже переводит сессию в согласованное состояние', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];

        setBuilderDraft({
            pagename: 'page-a',
            updatedAt: '2026-07-28T10:00:00.000Z',
            mode: 'edit',
            pageId: 1,
            draftSnapshot: {
                schema: { components: [buildComponent('draft-1')] },
                formState: { ...publishStore.currentFormState, pagename: 'page-a' },
            },
        });

        await context.session.openBuilderSession('page-a');
        expect(context.session.isSessionReady.value).toBe(false);

        context.session.handleDiscardDraft();

        expect(context.session.isSessionReady.value).toBe(true);
        expect(getBuilderDraft('page-a')).toBeNull();
        // На канвасе остаётся сохранённая версия, а не черновик
        expect(componentsStore.components.map((component) => component.id)).toEqual(['a1']);
    });
    it('запоздалый ответ уехавшей модалки не трогает новую сессию', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        const pageB = buildPageWithComponent(2, 'page-b', 'b1');
        publishStore.publishedPages = [pageA, pageB];
        serverPages = [pageA, pageB];

        setBuilderDraft({
            pagename: 'page-a',
            updatedAt: '2026-07-28T10:00:00.000Z',
            mode: 'edit',
            pageId: 1,
            draftSnapshot: {
                schema: { components: [buildComponent('draft-1')] },
                formState: { ...publishStore.currentFormState, pagename: 'page-a' },
            },
        });
        // Черновик страницы B — его запоздалый «Открыть сохранённую» удалил бы,
        // потому что ключ брался у живой сессии
        setBuilderDraft({
            pagename: 'page-b',
            updatedAt: '2026-07-28T11:00:00.000Z',
            mode: 'edit',
            pageId: 2,
            draftSnapshot: {
                schema: { components: [buildComponent('draft-b')] },
                formState: { ...publishStore.currentFormState, pagename: 'page-b' },
            },
        });

        await context.session.openBuilderSession('page-a');
        expect(context.session.isRestoreDraftModalOpen.value).toBe(true);

        // Навигация на B: модалка ещё уезжает leave-transition'ом и принимает клики
        deferredUrls = ['/api/bricks/2/'];
        const openingB = context.session.openBuilderSession('page-b');

        context.session.handleRestoreDraft();
        context.session.handleDiscardDraft();

        // Открытие B ещё идёт: готовность подниматься не должна, черновик B — цел
        expect(context.session.isSessionReady.value).toBe(false);
        expect(getBuilderDraft('page-b')).not.toBeNull();
        expect(componentsStore.components.map((component) => component.id)).not.toEqual([
            'draft-1',
        ]);

        // Открытие B доезжает до собственной модалки восстановления — и только её
        // ответ поднимает готовность и снимает уже её черновик
        (await deferred.waitFor('/api/bricks/2/')).resolve(pageB);
        await openingB;
        expect(context.session.isRestoreDraftModalOpen.value).toBe(true);
        expect(context.session.isSessionReady.value).toBe(false);
        expect(getBuilderDraft('page-b')).not.toBeNull();

        context.session.handleDiscardDraft();
        expect(context.session.isSessionReady.value).toBe(true);
        expect(getBuilderDraft('page-b')).toBeNull();
    });
    it('ответ на модалку одноразовый: второй клик по уезжающей ничего не делает', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];

        setBuilderDraft({
            pagename: 'page-a',
            updatedAt: '2026-07-28T10:00:00.000Z',
            mode: 'edit',
            pageId: 1,
            draftSnapshot: {
                schema: { components: [buildComponent('draft-1')] },
                formState: { ...publishStore.currentFormState, pagename: 'page-a' },
            },
        });

        await context.session.openBuilderSession('page-a');
        context.session.handleRestoreDraft();
        expect(componentsStore.components.map((component) => component.id)).toEqual(['draft-1']);

        // Модалка ещё уезжает: второй клик — уже по «Открыть сохранённую» — не должен
        // ни снести восстановленный черновик, ни тронуть канвас
        context.session.handleDiscardDraft();

        expect(getBuilderDraft('page-a')).not.toBeNull();
        expect(componentsStore.components.map((component) => component.id)).toEqual(['draft-1']);
    });
    it('перенос сессии снимает предложение восстановить, ничего не удаляя', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];

        setBuilderDraft({
            pagename: 'page-a',
            updatedAt: '2026-07-28T10:00:00.000Z',
            mode: 'edit',
            pageId: 1,
            draftSnapshot: {
                schema: { components: [buildComponent('draft-1')] },
                formState: { ...publishStore.currentFormState, pagename: 'page-a' },
            },
        });

        await context.session.openBuilderSession('page-a');
        expect(context.session.isRestoreDraftModalOpen.value).toBe(true);
        expect(context.session.isSessionReady.value).toBe(false);

        // Уже начатое сохранение доезжает и переносит сессию (renameSession зовут
        // напрямую и save, и Save as Copy) — поколение при этом не меняется, а
        // migrateBuilderDraft уже унёс запись под новый ключ
        await context.pagename.renameSession('renamed-page');
        await nextTick();

        // Предложение снято: отвечать больше не на что, сессия согласована. Снято
        // именно снятием, а не применением — на канвасе осталась сохранённая версия
        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(context.session.isSessionReady.value).toBe(true);
        expect(context.session.pendingDraft.value).toBeNull();
        expect(componentsStore.components.map((component) => component.id)).toEqual(['a1']);

        // Запоздалые ответы ничего не делают: черновик под новым ключом цел
        context.session.handleDiscardDraft();
        context.session.handleRestoreDraft();

        const migrated = getBuilderDraft('renamed-page');
        expect(migrated?.pageId).toBe(1);
        expect(migrated?.draftSnapshot.schema.components.map((item) => item.id)).toEqual([
            'draft-1',
        ]);
    });
});
