// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { effectScope, nextTick, reactive, type EffectScope } from 'vue';

// Types
import type {
    IPublishedPage,
    TPublishFormState,
} from '../src/runtime/modules/common/types/bricks-api';
// #endregion

// #region Mocks
/**
 * Мост route/router для стаба `#imports` (см. test/builderPagenameSession.spec.ts) —
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

vi.mock('../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { useBuilderPagename } from '../src/runtime/modules/builder/app/composables/useBuilderPagename';
import { useBuilderPagenameSync } from '../src/runtime/modules/builder/app/composables/useBuilderPagenameSync';
import { useBuilderSession } from '../src/runtime/modules/builder/app/composables/useBuilderSession';
import { useBuilderDraftPersistence } from '../src/runtime/modules/builder/app/composables/useBuilderDraftPersistence';
import {
    getBuilderDraft,
    setBuilderDraft,
} from '../src/runtime/modules/builder/publish/utils/draftStorage';
import { usePublishStore } from '../src/runtime/modules/builder/publish/stores/publish';

const AUTOSAVE_DEBOUNCE_MS = 800;

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
 * Собирает страницу для стейта стора/мока API с переопределениями.
 *
 * @param overrides - Переопределяемые поля.
 * @returns Полная структура IPublishedPage.
 */
function buildPage(overrides: Partial<IPublishedPage>): IPublishedPage {
    return {
        id: 1,
        pagename: 'original',
        title: 'Original',
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
        revision: 1,
        createdAt: '2026-06-01T10:00:00Z',
        updatedAt: '2026-06-30T10:00:00Z',
        ...overrides,
    };
}

/**
 * Собирает полное состояние формы публикации (для ручного построения черновиков).
 *
 * @param overrides - Переопределяемые поля.
 * @returns Полная структура TPublishFormState.
 */
function buildFormState(overrides: Partial<TPublishFormState> = {}): TPublishFormState {
    return {
        pagename: 'existing-page',
        title: 'Existing',
        description: 'Landing page',
        keywords: 'landing',
        published: true,
        layout: 'default',
        backgroundColor: '#ffffff',
        socialImage: '',
        urlPrefix: null,
        subdomain: null,
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
 * Поднимает связку composables сессии билдера в effectScope — та же проводка,
 * что в pages/[pagename].vue (без useBuilderPage: тяжёлые зависимости composable'а
 * — библиотека компонентов, модалки, превью — не нужны для проверки session identity).
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
            renameSession: pagename.renameSession,
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

describe('Save as Copy: единый переход сессии', () => {
    let activeScopes: EffectScope[] = [];
    // Сервер-мок POST /api/bricks/: реестр созданных страниц, нужен GET-мокам
    // ниже (список + point-lookup), чтобы switchToSavedPage/openBuilderSession
    // находили копию так же, как в реальном flow.
    let serverPages: IPublishedPage[] = [];

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
            params: { pagename: 'original' },
        });
        routerBridge.replace = vi.fn(async (to: { params: { pagename: string } }) => {
            routerBridge.route.params.pagename = to.params.pagename;
        });

        serverPages = [buildPage({ id: 1, pagename: 'original', title: 'Original' })];
        apiFetcherMock.mockReset();
        apiFetcherMock.mockImplementation(
            (url: string, options?: { method?: string; body?: Record<string, unknown> }) => {
                if (options?.method === 'POST') {
                    const created = buildPage({
                        id: serverPages.length + 1,
                        pagename: String(options.body?.pagename ?? ''),
                        title: String(options.body?.title ?? ''),
                        published: false,
                        revision: 1,
                    });
                    serverPages = [...serverPages, created];
                    return Promise.resolve(created);
                }

                const idMatch = /^\/api\/bricks\/(\d+)\/$/.exec(url);
                if (idMatch) {
                    const page = serverPages.find(
                        (candidate) => candidate.id === Number(idMatch[1])
                    );
                    return Promise.resolve(page ?? null);
                }

                // GET /api/bricks/ — список (в реальном API — сводки без schema)
                return Promise.resolve(serverPages);
            }
        );
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

    it('после Save as Copy совпадают editingPageId, form pagename, route и sessionPagename', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        publishStore.publishedPages = [
            buildPage({ id: 1, pagename: 'original', title: 'Original' }),
        ];
        await context.session.openBuilderSession('original');
        expect(publishStore.editingPageId).toBe(1);

        // Единый переход: сам handleSaveAsCopy делает ровно это в этом порядке
        const copy = await publishStore.saveCurrentPageAsCopy({ components: [] });
        expect(copy).not.toBeNull();
        expect(copy?.pagename).toBe('original-copy');

        await context.session.switchToSavedPage(copy as IPublishedPage);

        expect(publishStore.editingPageId).toBe(copy?.id);
        expect(publishStore.currentFormState.pagename).toBe('original-copy');
        expect(routerBridge.route.params.pagename).toBe('original-copy');
        expect(context.pagename.sessionPagename.value).toBe('original-copy');
    });

    it('autosave после Save as Copy пишет только по ключу копии, не оригинала', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        publishStore.publishedPages = [
            buildPage({ id: 1, pagename: 'original', title: 'Original' }),
        ];
        await context.session.openBuilderSession('original');

        const copy = await publishStore.saveCurrentPageAsCopy({ components: [] });
        await context.session.switchToSavedPage(copy as IPublishedPage);

        publishStore.setCurrentFormField('title', 'Изменения в копии');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        expect(getBuilderDraft('original-copy')?.draftSnapshot.formState.title).toBe(
            'Изменения в копии'
        );
        // Регрессия P1: раньше autosave продолжал писать под slug оригинала
        expect(getBuilderDraft('original')).toBeNull();
    });

    it('reload по URL копии открывает копию, а не оригинал', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        publishStore.publishedPages = [
            buildPage({ id: 1, pagename: 'original', title: 'Original' }),
        ];
        await context.session.openBuilderSession('original');

        const copy = await publishStore.saveCurrentPageAsCopy({ components: [] });
        await context.session.switchToSavedPage(copy as IPublishedPage);

        // «Reload» /bricks/original-copy: новый Pinia + новая проводка composables,
        // список страниц пуст — openBuilderSession сам сходит за ним (loadAllPages)
        context.scope.stop();
        setActivePinia(createPinia());
        const reloaded = mountTracked();
        const reloadedStore = usePublishStore();

        await reloaded.session.openBuilderSession('original-copy');

        expect(reloadedStore.editingPageId).toBe(copy?.id);
        expect(reloadedStore.editingPageId).not.toBe(1);
        expect(reloadedStore.currentFormState.pagename).toBe('original-copy');
    });

    it('restore-гейт: черновик предлагается только при точном совпадении draft.pageId', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        publishStore.publishedPages = [
            buildPage({ id: 5, pagename: 'page-match', title: 'Match' }),
            buildPage({ id: 6, pagename: 'page-foreign', title: 'Foreign' }),
            buildPage({ id: 7, pagename: 'page-legacy', title: 'Legacy' }),
        ];
        serverPages = publishStore.publishedPages as IPublishedPage[];

        // Совпадающий pageId + отличающийся контент — restore предлагается (регрессия
        // на сам механизм: гейт не должен ломать легитимный кейс)
        setBuilderDraft({
            pagename: 'page-match',
            updatedAt: new Date().toISOString(),
            mode: 'edit',
            pageId: 5,
            draftSnapshot: {
                schema: { components: [{ id: 'draft-brick' }] as never },
                formState: buildFormState({ pagename: 'page-match', title: 'Черновик' }),
            },
        });
        await context.session.openBuilderSession('page-match');
        expect(context.session.isRestoreDraftModalOpen.value).toBe(true);
        expect(context.session.pendingDraft.value?.pageId).toBe(5);

        // Чужой pageId (например, stale-черновик из-за старого бага без единого
        // перехода сессии) — restore НЕ предлагается, черновик подчищается
        setBuilderDraft({
            pagename: 'page-foreign',
            updatedAt: new Date().toISOString(),
            mode: 'edit',
            pageId: 999,
            draftSnapshot: {
                schema: { components: [{ id: 'draft-brick' }] as never },
                formState: buildFormState({ pagename: 'page-foreign', title: 'Черновик' }),
            },
        });
        await context.session.openBuilderSession('page-foreign');
        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(getBuilderDraft('page-foreign')).toBeNull();

        // Черновик без pageId (legacy, до появления этого поля) — тоже stale
        setBuilderDraft({
            pagename: 'page-legacy',
            updatedAt: new Date().toISOString(),
            mode: 'edit',
            draftSnapshot: {
                schema: { components: [{ id: 'draft-brick' }] as never },
                formState: buildFormState({ pagename: 'page-legacy', title: 'Черновик' }),
            },
        });
        await context.session.openBuilderSession('page-legacy');
        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(getBuilderDraft('page-legacy')).toBeNull();
    });

    it('ошибка saveCurrentPageAsCopy (валидация) не переключает сессию', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        publishStore.publishedPages = [
            buildPage({ id: 1, pagename: 'original', title: 'Original' }),
            // Занимает единственный слот генерации копии по умолчанию — не мешает
            // напрямую, но проверка ниже фиксирует поведение через generalError
        ];
        await context.session.openBuilderSession('original');

        // Пустой title после копии формы не проходит валидацию (title required) —
        // saveCurrentPageAsCopy должен вернуть null, не трогая store/route
        publishStore.setCurrentFormField('title', '');

        const copy = await publishStore.saveCurrentPageAsCopy({ components: [] });

        expect(copy).toBeNull();
        // editingPageId/route не тронуты — оркестрация не запускалась
        expect(publishStore.editingPageId).toBe(1);
        expect(routerBridge.route.params.pagename).toBe('original');
        expect(apiFetcherMock).not.toHaveBeenCalledWith(
            '/api/bricks/',
            expect.objectContaining({ method: 'POST' })
        );
    });
});
