// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { effectScope, nextTick, reactive, type EffectScope } from 'vue';

// Types
import type { IPublishedPage } from '../src/runtime/modules/common/types/bricks-api';
// #endregion

// #region Mocks
/**
 * Мост route/router для стаба `#imports`: hoisted-объект читается фабрикой мока
 * лениво (в момент вызова useRoute/useRouter), поэтому beforeEach может подменять
 * route и replace на каждый тест.
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

vi.mock('../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { useBuilderPagename } from '../src/runtime/modules/builder/app/composables/useBuilderPagename';
import { useBuilderPagenameSync } from '../src/runtime/modules/builder/app/composables/useBuilderPagenameSync';
import { useBuilderSession } from '../src/runtime/modules/builder/app/composables/useBuilderSession';
import { useBuilderDraftPersistence } from '../src/runtime/modules/builder/app/composables/useBuilderDraftPersistence';
import { getBuilderDraft } from '../src/runtime/modules/builder/publish/utils/draftStorage';
import { useComponentsStore } from '../src/runtime/modules/builder/core/stores/components';
import { usePublishStore } from '../src/runtime/modules/builder/publish/stores/publish';

const AUTOSAVE_DEBOUNCE_MS = 800;
const PAGENAME_SYNC_DEBOUNCE_MS = 600;

/**
 * Минимальный localStorage поверх Map — черновики билдера в node-окружении.
 */
function createLocalStorageStub(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    const data = new Map<string, string>();
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
            data.set(key, value);
        },
        removeItem: (key: string) => {
            data.delete(key);
        },
    };
}

/**
 * Собирает страницу для стейта стора с переопределениями.
 *
 * @param overrides - Переопределяемые поля.
 * @returns Полная структура IPublishedPage.
 */
function buildPage(overrides: Partial<IPublishedPage>): IPublishedPage {
    return {
        id: 1,
        pagename: 'home',
        title: 'Home',
        description: 'Landing page',
        keywords: 'landing',
        backgroundColor: '#ffffff',
        layout: 'default',
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: null,
        schema: { components: [] },
        published: true,
        createdAt: '2026-06-01T10:00:00Z',
        updatedAt: '2026-06-30T10:00:00Z',
        ...overrides,
    };
}

interface IBuilderContext {
    scope: EffectScope;
    pagename: ReturnType<typeof useBuilderPagename>;
    session: ReturnType<typeof useBuilderSession>;
    showToastMock: ReturnType<typeof vi.fn>;
}

/**
 * Поднимает связку composables страницы билдера в effectScope —
 * та же проводка, что в pages/[pagename].vue.
 */
function mountBuilderContext(): IBuilderContext {
    const scope = effectScope();
    const showToastMock = vi.fn();

    const context = scope.run(() => {
        const pagename = useBuilderPagename();
        const session = useBuilderSession({
            routePagename: pagename.routePagename,
            sessionPagename: pagename.sessionPagename,
            showToast: showToastMock,
        });
        useBuilderDraftPersistence({
            sessionPagename: pagename.sessionPagename,
            isSessionLoading: session.isSessionLoading,
            isRestoreDraftModalOpen: session.isRestoreDraftModalOpen,
            savedSnapshot: session.savedSnapshot,
            buildCurrentSnapshot: session.buildCurrentSnapshot,
        });
        useBuilderPagenameSync({ renameSession: pagename.renameSession });
        return { pagename, session };
    });

    if (!context) {
        throw new Error('effectScope.run returned no context');
    }

    return { scope, ...context, showToastMock };
}

describe('pagename билдера: rename, autosave, reload', () => {
    let activeScopes: EffectScope[] = [];

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal('window', {
            localStorage: createLocalStorageStub(),
            setTimeout: (handler: () => void, timeout?: number) =>
                globalThis.setTimeout(handler, timeout) as unknown as number,
            clearTimeout: (id: number | null) =>
                globalThis.clearTimeout(id as unknown as NodeJS.Timeout),
        });
        vi.useFakeTimers();

        routerBridge.route = reactive({
            name: 'bricks-builder-pagename',
            params: { pagename: 'draft-page' },
        });
        routerBridge.replace = vi.fn(async (to: { params: { pagename: string } }) => {
            routerBridge.route.params.pagename = to.params.pagename;
        });
        apiFetcherMock.mockReset();
        apiFetcherMock.mockResolvedValue([]);
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

    it('rename → autosave → reload: черновик мигрирует и пишется по новому ключу', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession('draft-page');

        // Правка контента новой страницы → autosave в черновик по ключу URL
        publishStore.setCurrentFormField('title', 'Черновик');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('draft-page')?.draftSnapshot.formState.title).toBe('Черновик');

        // Rename новой страницы → миграция черновика + router.replace
        publishStore.setCurrentFormField('pagename', 'landing');
        await nextTick();
        await vi.advanceTimersByTimeAsync(PAGENAME_SYNC_DEBOUNCE_MS);
        await nextTick();

        expect(context.pagename.sessionPagename.value).toBe('landing');
        expect(routerBridge.replace).toHaveBeenCalledWith({
            name: 'bricks-builder-pagename',
            params: { pagename: 'landing' },
        });
        expect(routerBridge.route.params.pagename).toBe('landing');
        expect(getBuilderDraft('draft-page')).toBeNull();
        expect(getBuilderDraft('landing')?.draftSnapshot.formState.title).toBe('Черновик');

        // Дальнейший autosave — по новому ключу (регрессия P1: раньше писал по старому)
        publishStore.setCurrentFormField('title', 'Черновик 2');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('landing')?.draftSnapshot.formState.title).toBe('Черновик 2');
        expect(getBuilderDraft('draft-page')).toBeNull();

        // «Reload» /bricks/landing: новый Pinia + новая проводка composables
        context.scope.stop();
        setActivePinia(createPinia());
        const reloaded = mountTracked();
        const reloadedStore = usePublishStore();

        await reloaded.session.openBuilderSession('landing');

        expect(reloadedStore.currentFormState.title).toBe('Черновик 2');
        expect(reloaded.showToastMock).toHaveBeenCalledWith(
            'bricks.publish.toasts.unsavedChanges',
            'error',
            30000
        );
    });

    it('rename собственной сессии не переоткрывает её, навигация — переоткрывает', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();
        const loadSchemaSpy = vi.spyOn(componentsStore, 'loadSchema');

        await context.session.openBuilderSession('draft-page');
        expect(loadSchemaSpy).toHaveBeenCalledTimes(1);

        // Rename: routePagename догоняет sessionPagename — bootstrap не повторяется
        publishStore.setCurrentFormField('pagename', 'landing');
        await nextTick();
        await vi.advanceTimersByTimeAsync(PAGENAME_SYNC_DEBOUNCE_MS);
        await nextTick();

        expect(routerBridge.route.params.pagename).toBe('landing');
        expect(loadSchemaSpy).toHaveBeenCalledTimes(1);

        // Внешняя навигация (back/forward между страницами билдера) — переоткрытие
        routerBridge.route.params.pagename = 'other-page';
        await nextTick();
        await vi.waitFor(() => {
            expect(loadSchemaSpy).toHaveBeenCalledTimes(2);
        });
        expect(context.pagename.sessionPagename.value).toBe('other-page');
    });

    it('редактирование существующей страницы не трогает URL до сохранения', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        publishStore.publishedPages = [buildPage({ id: 1, pagename: 'draft-page' })];

        await context.session.openBuilderSession('draft-page');
        expect(publishStore.editingPageId).toBe(1);

        publishStore.setCurrentFormField('pagename', 'landing');
        await nextTick();
        await vi.advanceTimersByTimeAsync(PAGENAME_SYNC_DEBOUNCE_MS);

        expect(routerBridge.replace).not.toHaveBeenCalled();
        expect(context.pagename.sessionPagename.value).toBe('draft-page');
    });

    it('зарезервированный и занятый pagename не переносят сессию', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        publishStore.publishedPages = [buildPage({ id: 2, pagename: 'taken' })];

        await context.session.openBuilderSession('draft-page');

        publishStore.setCurrentFormField('pagename', 'login');
        await nextTick();
        await vi.advanceTimersByTimeAsync(PAGENAME_SYNC_DEBOUNCE_MS);
        expect(routerBridge.replace).not.toHaveBeenCalled();

        publishStore.setCurrentFormField('pagename', 'taken');
        await nextTick();
        await vi.advanceTimersByTimeAsync(PAGENAME_SYNC_DEBOUNCE_MS);
        expect(routerBridge.replace).not.toHaveBeenCalled();

        expect(context.pagename.sessionPagename.value).toBe('draft-page');
    });

    it('renameSession: no-op при совпадении и вне страницы билдера', async () => {
        const context = mountTracked();

        await context.pagename.renameSession('draft-page');
        await context.pagename.renameSession('   ');
        expect(routerBridge.replace).not.toHaveBeenCalled();

        // Сессия уже покинута (например, переход на дашборд)
        routerBridge.route.name = 'bricks-builder-index';
        await context.pagename.renameSession('landing');
        expect(routerBridge.replace).not.toHaveBeenCalled();
        expect(context.pagename.sessionPagename.value).toBe('draft-page');
    });

    it('после успешного сохранения черновик удаляется по ключу сессии', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession('draft-page');

        publishStore.setCurrentFormField('title', 'Несохранённое');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('draft-page')).not.toBeNull();

        // Успешное сохранение: страница появилась на сервере, стор фиксирует сохранение
        publishStore.publishedPages = [buildPage({ id: 5, pagename: 'draft-page' })];
        publishStore.startEditingPage(5);
        publishStore.lastSuccessfulSaveAt = Date.now();
        await nextTick();

        expect(getBuilderDraft('draft-page')).toBeNull();
    });
});
