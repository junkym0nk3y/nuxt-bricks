// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { nextTick, reactive, type EffectScope } from 'vue';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { IBuilderContext, IWindowStub } from '../helpers/types';

// Utils
import {
    AUTOSAVE_DEBOUNCE_MS,
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

import {
    getBuilderDraft,
    setBuilderDraft,
} from '../../src/runtime/modules/builder/publish/utils/draftStorage';
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
import { useHistoryStore } from '../../src/runtime/modules/builder/core/stores/history';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

/**
 * Минимальный компонент канваса для проверки правки пропса.
 *
 * @returns Компонент схемы с известным значением `text`.
 */
function buildComponent(): IBricksComponent {
    return {
        id: 'c1',
        type: 'component',
        componentName: 'Text',
        brickPath: '/components/Text.brick.ts',
        zIndex: 1,
        props: { text: 'Исходное значение' },
    };
}

const buildFormState = createFormStateBuilder({
    pagename: 'draft-page',
    title: '',
    description: '',
    keywords: '',
    socialImage: '',
    createdAt: '',
    updatedAt: '',
});

const buildPage = createPageBuilder({
    pagename: 'home',
    title: 'Home',
    description: 'Landing page',
    keywords: 'landing',
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-30T10:00:00Z',
});

// core/utils/history.ts, clampHistory(limit = 50)
const HISTORY_LIMIT = 50;
// core/stores/actions/properties.ts, debouncedSaveToHistory
const PROP_HISTORY_DEBOUNCE_MS = 300;

describe('черновик билдера: автосейв и сброс при уходе со страницы', () => {
    let activeScopes: EffectScope[] = [];
    let windowStub: IWindowStub;

    beforeEach(() => {
        setActivePinia(createPinia());
        windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        vi.useFakeTimers();

        routerBridge.route = reactive({
            name: 'bricks-builder-pagename',
            params: { pagename: 'draft-page' },
        });
        routerBridge.replace = vi.fn();
        apiFetcherMock.mockReset();
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
        vi.restoreAllMocks();
    });

    /**
     * Поднимает контекст и регистрирует scope для очистки в afterEach.
     */
    function mountTracked(): IBuilderContext {
        const context = mountBuilderContext();
        activeScopes.push(context.scope);
        return context;
    }

    it('pagehide до истечения debounce: правка попадает в localStorage', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession('draft-page');
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        publishStore.setCurrentFormField('title', 'Правка перед reload');
        await nextTick();

        // Половина окна debounce: таймер ещё тикает, и раньше такая правка гибла
        // вместе со страницей
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS / 2);
        expect(getBuilderDraft('draft-page')?.draftSnapshot.formState.title).not.toBe(
            'Правка перед reload'
        );

        windowStub.dispatchEvent({ type: 'pagehide' });
        const flushed = getBuilderDraft('draft-page');
        expect(flushed?.draftSnapshot.formState.title).toBe('Правка перед reload');

        // Сброс снял таймер: повторной записи по истечении debounce нет. Сверяем
        // updatedAt, а не title — при повторном сохранении содержимое совпало бы
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('draft-page')?.updatedAt).toBe(flushed?.updatedAt);
    });

    it('pagehide в окне debounce истории: правка пропса не теряется', async () => {
        const context = mountTracked();
        const componentsStore = useComponentsStore();

        await context.session.openBuilderSession('draft-page');
        componentsStore.loadSchema({ components: [buildComponent()] }, { resetHistory: true });
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        // updateComponentProp меняет компонент синхронно, а saveToHistory вызывает
        // через собственный debounce 300 мс: historyIndex ещё прежний, watch
        // автосейва не срабатывал, таймера нет — но снимок уже другой
        componentsStore.updateComponentProp('c1', 'text', 'Новое значение');
        await nextTick();
        expect(getBuilderDraft('draft-page')?.draftSnapshot.schema.components[0]?.props.text).toBe(
            'Исходное значение'
        );

        windowStub.dispatchEvent({ type: 'pagehide' });
        expect(getBuilderDraft('draft-page')?.draftSnapshot.schema.components[0]?.props.text).toBe(
            'Новое значение'
        );
    });

    it('pagehide после сохранения черновик не воскрешает', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession('draft-page');
        publishStore.setCurrentFormField('title', 'Несохранённое');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('draft-page')).not.toBeNull();

        // Успешное сохранение: страница появилась на сервере, черновик снят.
        // Фиксацию зовёт сам сохраняющий (useBuilderPage), сверив токен сессии, —
        // здесь воспроизводится этот вызов
        publishStore.publishedPages = [buildPage({ id: 5, pagename: 'draft-page' })];
        publishStore.startEditingPage(5);
        context.session.commitSavedSnapshot(context.sessionToken.capture());
        await nextTick();
        expect(getBuilderDraft('draft-page')).toBeNull();

        // Закрытие вкладки сразу после сохранения: сброс идёт через persistDraftNow,
        // то есть сверяется с savedSnapshot, а не пишет черновик мимо guard'ов
        windowStub.dispatchEvent({ type: 'pagehide' });
        expect(getBuilderDraft('draft-page')).toBeNull();
    });

    it('pagehide после ошибки открытия сессии не затирает черновик', async () => {
        // Валидный черновик в localStorage до открытия сессии
        setBuilderDraft({
            pagename: 'draft-page',
            updatedAt: '2026-07-28T10:00:00.000Z',
            mode: 'new',
            draftSnapshot: {
                schema: { components: [buildComponent()] },
                formState: buildFormState({ pagename: 'draft-page', title: 'Ценная работа' }),
            },
        });

        const context = mountTracked();
        apiFetcherMock.mockRejectedValue(new Error('Network down'));

        // Bootstrap падает на загрузке списка страниц: isSessionLoading снимается
        // в finally, а на канвасе и в форме остаются дефолты
        await context.session.openBuilderSession('draft-page');
        expect(context.session.isSessionReady.value).toBe(false);

        windowStub.dispatchEvent({ type: 'pagehide' });

        const draft = getBuilderDraft('draft-page');
        expect(draft?.updatedAt).toBe('2026-07-28T10:00:00.000Z');
        expect(draft?.draftSnapshot.formState.title).toBe('Ценная работа');
    });

    it('остановка scope (уход из редактора) сохраняет отложенную правку', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession('draft-page');
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        publishStore.setCurrentFormField('title', 'Ушёл на дашборд');
        await nextTick();

        // SPA-навигация: pagehide не приходит, страница размонтируется
        context.scope.stop();

        expect(getBuilderDraft('draft-page')?.draftSnapshot.formState.title).toBe(
            'Ушёл на дашборд'
        );
    });

    it('переход на другую страницу билдера сохраняет правку прежней', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession('draft-page');
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        publishStore.setCurrentFormField('title', 'Правка страницы A');
        await nextTick();

        // Back/forward между страницами билдера: страница не размонтируется
        // (статический page key), поэтому dispose не срабатывает, а сессия
        // переключается на новый pagename вместе с ключом черновика
        routerBridge.route.params.pagename = 'other-page';
        await nextTick();

        expect(getBuilderDraft('draft-page')?.draftSnapshot.formState.title).toBe(
            'Правка страницы A'
        );

        // Отложенный таймер прежней страницы снят: содержимое A в черновик B не уедет
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(getBuilderDraft('other-page')?.draftSnapshot.formState.title).not.toBe(
            'Правка страницы A'
        );
    });

    it('автосейв канваса продолжается после заполнения истории', async () => {
        const context = mountTracked();
        const componentsStore = useComponentsStore();
        const historyStore = useHistoryStore();

        await context.session.openBuilderSession('draft-page');
        componentsStore.loadSchema({ components: [buildComponent()] }, { resetHistory: true });
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        for (let index = 0; index < HISTORY_LIMIT; index += 1) {
            componentsStore.saveToHistory();
        }
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        // Лимит достигнут: дальше capture() возвращает индекс на место, и watch,
        // наблюдавший сам индекс, переставал видеть правки канваса
        expect(historyStore.history.length).toBe(HISTORY_LIMIT);
        const indexAtLimit = historyStore.historyIndex;
        componentsStore.saveToHistory();
        expect(historyStore.historyIndex).toBe(indexAtLimit);

        // Даём таймеру от этого capture отработать: иначе правка ниже могла бы уехать
        // в черновик на нём, а не на собственном capture за лимитом
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        const settledAt = getBuilderDraft('draft-page')?.updatedAt;

        componentsStore.updateComponentProp('c1', 'text', 'После лимита');
        await vi.advanceTimersByTimeAsync(PROP_HISTORY_DEBOUNCE_MS);
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        expect(getBuilderDraft('draft-page')?.draftSnapshot.schema.components[0]?.props.text).toBe(
            'После лимита'
        );
        expect(getBuilderDraft('draft-page')?.updatedAt).not.toBe(settledAt);
    });

    it('слушатель pagehide снимается вместе со scope страницы', async () => {
        const addSpy = vi.spyOn(windowStub, 'addEventListener');
        const context = mountTracked();

        await context.session.openBuilderSession('draft-page');

        const registration = addSpy.mock.calls.find(([type]) => type === 'pagehide');
        expect(registration).toBeDefined();

        const removeSpy = vi.spyOn(windowStub, 'removeEventListener');
        context.scope.stop();

        expect(removeSpy).toHaveBeenCalledWith('pagehide', registration?.[1]);
    });
});
