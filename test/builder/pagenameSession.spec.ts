// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { nextTick, reactive, type EffectScope } from 'vue';

// Types
import type { IBuilderContext } from '../helpers/types';

// Utils
import {
    AUTOSAVE_DEBOUNCE_MS,
    PAGENAME_SYNC_DEBOUNCE_MS,
    createWindowStub,
    mountBuilderContext,
} from '../helpers/builderSessionHarness';
import { createPageBuilder } from '../helpers/publishFixtures';
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

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { getBuilderDraft } from '../../src/runtime/modules/builder/publish/utils/draftStorage';
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({
    pagename: 'home',
    title: 'Home',
    description: 'Landing page',
    keywords: 'landing',
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-30T10:00:00Z',
});

describe('pagename билдера: rename, autosave, reload', () => {
    let activeScopes: EffectScope[] = [];

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal('window', createWindowStub());
        vi.useFakeTimers();

        routerBridge.route = reactive({
            name: 'bricks-builder-pagename',
            params: { pagename: 'draft-page' },
        });
        routerBridge.replace = vi.fn(async (to: { params: { pagename: string } }) => {
            routerBridge.route.params.pagename = to.params.pagename;
        });
        apiFetcherMock.mockReset();
        // Список — сводки; полная страница со schema приходит point-lookup'ом GET /api/bricks/:id/
        apiFetcherMock.mockImplementation((url: unknown) => {
            const idMatch = /^\/api\/bricks\/(\d+)\/$/.exec(String(url));

            if (idMatch) {
                return Promise.resolve(buildPage({ id: Number(idMatch[1]) }));
            }

            return Promise.resolve([]);
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

        // Успешное сохранение: страница появилась на сервере, сохраняющий фиксирует
        // снапшот явно (сверив токен сессии) — раньше это делал watch на
        // lastSuccessfulSaveAt, не знавший инициатора (BM-26)
        publishStore.publishedPages = [buildPage({ id: 5, pagename: 'draft-page' })];
        publishStore.startEditingPage(5);
        context.session.commitSavedSnapshot(context.sessionToken.capture());
        await nextTick();

        expect(getBuilderDraft('draft-page')).toBeNull();
    });

    it('сохранение, доехавшее после открытия другой страницы, её черновик не трогает', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        // Обе страницы существующие: только в edit-режиме черновик сверяется с
        // savedSnapshot, то есть только там поздняя фиксация его и удаляла
        publishStore.publishedPages = [
            buildPage({ id: 5, pagename: 'first-page' }),
            buildPage({ id: 7, pagename: 'second-page' }),
        ];

        routerBridge.route.params.pagename = 'first-page';
        await context.session.openBuilderSession('first-page');
        expect(publishStore.editingPageId).toBe(5);

        publishStore.setCurrentFormField('title', 'Правка первой');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('first-page')).not.toBeNull();

        // Пользователь ушёл на другую страницу, не дождавшись ответа сервера
        routerBridge.route.params.pagename = 'second-page';
        await context.session.openBuilderSession('second-page');
        expect(publishStore.editingPageId).toBe(7);

        publishStore.setCurrentFormField('title', 'Правка второй');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('second-page')).not.toBeNull();

        // Ответ на сохранение первой страницы: стор поднимает свою метку успеха.
        // Фиксацию снапшота она больше не запускает — её зовёт сам сохраняющий,
        // сверив токен сессии. Прежний watch на lastSuccessfulSaveAt объявил бы
        // сохранённым снапшот второй страницы и удалил её черновик (BM-26)
        publishStore.lastSuccessfulSaveAt = Date.now();
        await nextTick();

        expect(getBuilderDraft('second-page')?.draftSnapshot.formState.title).toBe('Правка второй');
        expect(getBuilderDraft('first-page')?.draftSnapshot.formState.title).toBe('Правка первой');
    });

    it('фиксация снапшота с токеном прежней сессии — no-op', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        publishStore.publishedPages = [
            buildPage({ id: 5, pagename: 'first-page' }),
            buildPage({ id: 7, pagename: 'second-page' }),
        ];

        routerBridge.route.params.pagename = 'first-page';
        await context.session.openBuilderSession('first-page');

        // Токен снят на старте сохранения первой страницы
        const startedIn = context.sessionToken.capture();

        routerBridge.route.params.pagename = 'second-page';
        await context.session.openBuilderSession('second-page');
        publishStore.setCurrentFormField('title', 'Правка второй');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('second-page')).not.toBeNull();

        // Между проверкой токена у вызывающего и этим вызовом стоит
        // `await renameSession` (внутри — router.replace): перехваченная за это
        // время навигация иначе фиксировала бы снапшот чужой страницы и удаляла
        // её черновик. Поэтому токен сверяет сама фиксация (BM-26, находка ревью)
        context.session.commitSavedSnapshot(startedIn);

        expect(getBuilderDraft('second-page')?.draftSnapshot.formState.title).toBe('Правка второй');
        expect(context.session.savedSnapshot.value?.formState.title).not.toBe('Правка второй');
    });
});
