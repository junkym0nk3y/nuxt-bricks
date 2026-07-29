// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { nextTick, reactive, type EffectScope } from 'vue';

// Types
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';
import type { IBuilderContext, IDeferredApi } from '../helpers/types';

// Utils
import {
    AUTOSAVE_DEBOUNCE_MS,
    PAGENAME_SYNC_DEBOUNCE_MS,
    createDeferredApi,
    createWindowStub,
    mountBuilderContext,
} from '../helpers/builderSessionHarness';
import { createFormStateBuilder, createPageBuilder } from '../helpers/publishFixtures';
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
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({
    pagename: 'original',
    title: 'Original',
    description: 'Landing page',
    keywords: 'landing',
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-30T10:00:00Z',
});

const buildFormState = createFormStateBuilder({
    pagename: 'existing-page',
    title: 'Existing',
    description: 'Landing page',
    keywords: 'landing',
    socialImage: '',
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-30T10:00:00Z',
});

describe('Save as Copy: единый переход сессии', () => {
    let activeScopes: EffectScope[] = [];
    // Сервер-мок POST /api/bricks/: реестр созданных страниц, нужен GET-мокам
    // ниже (список + point-lookup), чтобы switchToSavedPage/openBuilderSession
    // находили копию так же, как в реальном flow.
    let serverPages: IPublishedPage[] = [];
    // Медленный POST: ответ держит сам тест (проверка гонки с pagename-sync)
    let deferred: IDeferredApi;
    let isPostDeferred = false;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal('window', createWindowStub());
        vi.useFakeTimers();

        routerBridge.route = reactive({
            name: 'bricks-builder-pagename',
            params: { pagename: 'original' },
        });
        routerBridge.replace = vi.fn(async (to: { params: { pagename: string } }) => {
            routerBridge.route.params.pagename = to.params.pagename;
        });

        serverPages = [buildPage({ id: 1, pagename: 'original', title: 'Original' })];
        deferred = createDeferredApi();
        isPostDeferred = false;
        apiFetcherMock.mockReset();
        apiFetcherMock.mockImplementation(
            (url: string, options?: { method?: string; body?: Record<string, unknown> }) => {
                if (options?.method === 'POST') {
                    if (isPostDeferred) {
                        return deferred.handle(url);
                    }

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
            buildPage({ id: 7, pagename: 'page-stale', title: 'Stale' }),
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

        // Черновик без pageId (повреждённый/чужой формат) — тоже stale
        setBuilderDraft({
            pagename: 'page-stale',
            updatedAt: new Date().toISOString(),
            mode: 'edit',
            draftSnapshot: {
                schema: { components: [{ id: 'draft-brick' }] as never },
                formState: buildFormState({ pagename: 'page-stale', title: 'Черновик' }),
            },
        });
        await context.session.openBuilderSession('page-stale');
        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(getBuilderDraft('page-stale')).toBeNull();
    });

    it('медленный Save as Copy не уводит сессию на слаг копии', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        publishStore.publishedPages = [
            buildPage({ id: 1, pagename: 'original', title: 'Original' }),
        ];
        await context.session.openBuilderSession('original');

        // Черновик по ключу оригинала: преждевременный rename увёл бы его под slug копии
        publishStore.setCurrentFormField('title', 'Правка оригинала');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('original')).not.toBeNull();

        // Save as Copy на время запроса ставит editingPageId = null и pagename копии
        // в форму — для pagename-sync это выглядит как новая страница
        isPostDeferred = true;
        const saving = publishStore.saveCurrentPageAsCopy({ components: [] });
        await nextTick();

        // POST длится дольше окна debounce синхронизации URL
        await vi.advanceTimersByTimeAsync(PAGENAME_SYNC_DEBOUNCE_MS);
        (await deferred.waitFor('/api/bricks/')).reject(new Error('Network down'));

        expect(await saving).toBeNull();
        expect(routerBridge.replace).not.toHaveBeenCalled();
        expect(context.pagename.sessionPagename.value).toBe('original');
        expect(getBuilderDraft('original')?.draftSnapshot.formState.title).toBe('Правка оригинала');
        expect(getBuilderDraft('original-copy')).toBeNull();
    });

    it('уже запланированная синхронизация URL не срабатывает во время Save as Copy', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        // Новая (несохранённая) страница: только для неё pagename-sync планирует перенос
        await context.session.openBuilderSession('fresh-page');
        expect(publishStore.editingPageId).toBeNull();

        // Пользователь правит pagename и, не дожидаясь окна debounce, жмёт Save as Copy
        publishStore.setCurrentFormField('title', 'Свежая');
        publishStore.setCurrentFormField('description', 'Описание');
        publishStore.setCurrentFormField('pagename', 'typed-name');
        await nextTick();
        await vi.advanceTimersByTimeAsync(PAGENAME_SYNC_DEBOUNCE_MS / 2);

        isPostDeferred = true;
        const saving = publishStore.saveCurrentPageAsCopy({ components: [] });
        await nextTick();
        await vi.advanceTimersByTimeAsync(PAGENAME_SYNC_DEBOUNCE_MS);

        (await deferred.waitFor('/api/bricks/')).reject(new Error('Network down'));
        expect(await saving).toBeNull();

        expect(routerBridge.replace).not.toHaveBeenCalled();
        expect(context.pagename.sessionPagename.value).toBe('fresh-page');
    });

    it('копия, доехавшая после открытия другой страницы, не откатывает её форму', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        serverPages = [
            buildPage({ id: 1, pagename: 'original', title: 'Original' }),
            buildPage({ id: 2, pagename: 'second', title: 'Second' }),
        ];
        publishStore.publishedPages = [...serverPages];
        await context.session.openBuilderSession('original');
        expect(publishStore.editingPageId).toBe(1);

        // Save as Copy уходит из сессии оригинала — так же, как handleSaveAsCopy:
        // токен снимается на старте и отдаётся стору проверкой
        isPostDeferred = true;
        const startedIn = context.sessionToken.capture();
        const saving = publishStore.saveCurrentPageAsCopy(
            { components: [] },
            { isInitiatorCurrent: () => context.sessionToken.isCurrent(startedIn) }
        );
        await nextTick();

        // Пока летит POST, пользователь открывает другую страницу
        routerBridge.route.params.pagename = 'second';
        await context.session.openBuilderSession('second');
        expect(publishStore.editingPageId).toBe(2);

        const created = buildPage({ id: 3, pagename: 'original-copy', title: 'Original (copy)' });
        (await deferred.waitFor('/api/bricks/')).resolve(created);
        const copy = await saving;

        // Копия создана и попала в общий список — это не сессионное состояние
        expect(copy?.pagename).toBe('original-copy');
        expect(publishStore.getPageById(3)?.pagename).toBe('original-copy');

        // А форма и editingPageId принадлежат уже открытой странице: безусловный
        // откат в finally вернул бы их к оригиналу (BM-26)
        expect(publishStore.editingPageId).toBe(2);
        expect(publishStore.currentFormState.pagename).toBe('second');
        expect(routerBridge.route.params.pagename).toBe('second');
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
