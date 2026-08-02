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
    AUTOSAVE_DEBOUNCE_MS,
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

describe('предложение восстановить черновик', () => {
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

    /**
     * Кладёт в хранилище черновик страницы с узнаваемым компонентом.
     *
     * @param pagename - Ключ сессии.
     * @param pageId - Идентификатор страницы, которой принадлежит черновик.
     * @param componentId - Идентификатор компонента в снапшоте черновика.
     */
    function seedDraft(pagename: string, pageId: number, componentId: string): void {
        const publishStore = usePublishStore();

        setBuilderDraft({
            pagename,
            updatedAt: '2026-07-28T10:00:00.000Z',
            mode: 'edit',
            pageId,
            draftSnapshot: {
                schema: { components: [buildComponent(componentId)] },
                formState: { ...publishStore.currentFormState, pagename },
            },
        });
    }

    it('найденный черновик не держит сессию: страница открыта, предложение висит рядом', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');

        // Сессия согласована: на канвасе сохранённая версия, править её можно.
        // Модалка сама не открывается — спрашивать посреди загрузки нечем
        expect(context.session.isDraftRestorePending.value).toBe(true);
        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(context.session.isSessionReady.value).toBe(true);
        expect(componentsStore.components.map((component) => component.id)).toEqual(['a1']);
    });

    it('восстановление применяет черновик поверх открытой сохранённой версии', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');

        context.session.openRestoreDraftModal();
        expect(context.session.isRestoreDraftModalOpen.value).toBe(true);

        context.session.handleRestoreDraft();

        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(context.session.isDraftRestorePending.value).toBe(false);
        expect(componentsStore.components.map((component) => component.id)).toEqual(['draft-1']);
    });

    it('закрытие окна откладывает: черновик цел, предложение на месте', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');
        context.session.openRestoreDraftModal();

        // Esc, крестик и клик по фону ведут сюда же: раньше это удаляло черновик,
        // то есть промах мимо кнопки уносил несохранённую работу
        context.session.handleDeferDraft();

        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(context.session.isDraftRestorePending.value).toBe(true);
        expect(getBuilderDraft('page-a')).not.toBeNull();
        expect(componentsStore.components.map((component) => component.id)).toEqual(['a1']);

        // Отложенное предложение открывается повторно — тем же кликом по тосту
        context.session.openRestoreDraftModal();
        expect(context.session.isRestoreDraftModalOpen.value).toBe(true);
    });

    it('удаление — единственный ответ, который сносит черновик', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');
        context.session.openRestoreDraftModal();
        context.session.handleDiscardDraft();

        expect(context.session.isDraftRestorePending.value).toBe(false);
        expect(getBuilderDraft('page-a')).toBeNull();
        // На канвасе остаётся сохранённая версия, а не черновик
        expect(componentsStore.components.map((component) => component.id)).toEqual(['a1']);
    });

    it('до ответа автосейв не сносит черновик как совпадающий с сохранённой версией', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');

        // Сброс на выгрузке безусловен, а на канвасе — сохранённая версия: без
        // запрета по неотвеченному черновику сравнение с savedSnapshot удалило бы
        // предложенный снапшот раньше, чем пользователь успел на него ответить
        window.dispatchEvent(new Event('pagehide'));

        expect(getBuilderDraft('page-a')?.draftSnapshot.schema.components[0]?.id).toBe('draft-1');
    });

    it('служебная перезапись формы тем же значением не считается правкой', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');

        // Сохранение на каждом заходе заново присваивает `published` — в том числе
        // тем же значением. Приняв это за правку, предложение сняли бы само, а
        // автосейв следом удалил бы черновик как совпадающий с сохранённой версией:
        // неудачный (или ещё летящий) запрос уносил бы несохранённую работу
        publishStore.setCurrentFormField('published', publishStore.currentFormState.published);

        expect(context.session.isDraftRestorePending.value).toBe(true);

        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        window.dispatchEvent(new Event('pagehide'));

        expect(getBuilderDraft('page-a')?.draftSnapshot.schema.components[0]?.id).toBe('draft-1');
    });

    it('правка канваса до фиксации в истории переживает выгрузку страницы', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');

        // Правка пропса меняет компонент синхронно, а историю фиксирует через 300 мс:
        // в это окно предложение ещё висит, и запрет на удаление черновика не должен
        // заодно запрещать запись — иначе выгрузка теряет последнюю правку
        componentsStore.updateComponentProp('a1', 'text', 'Правка до фиксации');
        window.dispatchEvent(new Event('pagehide'));

        const draft = getBuilderDraft('page-a');
        expect(draft?.draftSnapshot.schema.components[0]?.id).toBe('a1');
        expect(draft?.draftSnapshot.schema.components[0]?.props?.text).toBe('Правка до фиксации');
    });

    it('первая собственная правка снимает предложение и отпускает автосейв', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');

        publishStore.setCurrentFormField('title', 'Правка поверх сохранённой');

        // Снимается сразу, а не по дебаунсу автосейва: наблюдатель синхронный, иначе
        // первая правка ушла бы в отказ по ещё поднятому запрету и не сохранилась
        expect(context.session.isDraftRestorePending.value).toBe(false);

        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        // Черновик перезаписан собственной правкой — восстанавливать больше нечего
        const draft = getBuilderDraft('page-a');
        expect(draft?.draftSnapshot.formState.title).toBe('Правка поверх сохранённой');
        expect(draft?.draftSnapshot.schema.components.map((item) => item.id)).toEqual(['a1']);
    });

    it('запоздалый ответ по предложению прежней сессии не трогает новую', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        const pageB = buildPageWithComponent(2, 'page-b', 'b1');
        publishStore.publishedPages = [pageA, pageB];
        serverPages = [pageA, pageB];

        seedDraft('page-a', 1, 'draft-1');
        // Черновик страницы B — его запоздалое «Удалить» снесло бы, потому что ключ
        // брался у живой сессии
        seedDraft('page-b', 2, 'draft-b');

        await context.session.openBuilderSession('page-a');
        expect(context.session.isDraftRestorePending.value).toBe(true);

        // Навигация на B: тост прежней сессии ещё уезжает и принимает клики
        deferredUrls = ['/api/bricks/2/'];
        const openingB = context.session.openBuilderSession('page-b');

        context.session.openRestoreDraftModal();
        context.session.handleRestoreDraft();
        context.session.handleDiscardDraft();

        // Открытие B ещё идёт: ни канвас, ни черновик B тронуты не были
        expect(context.session.isRestoreDraftModalOpen.value).toBe(false);
        expect(context.session.isSessionReady.value).toBe(false);
        expect(getBuilderDraft('page-b')).not.toBeNull();
        expect(componentsStore.components.map((component) => component.id)).not.toEqual([
            'draft-1',
        ]);

        // Открытие B доезжает до собственного предложения — и только его ответ
        // снимает уже его черновик
        (await deferred.waitFor('/api/bricks/2/')).resolve(pageB);
        await openingB;
        expect(context.session.isDraftRestorePending.value).toBe(true);
        expect(getBuilderDraft('page-b')).not.toBeNull();

        context.session.handleDiscardDraft();
        expect(getBuilderDraft('page-b')).toBeNull();
    });

    it('ответ одноразовый: второй клик по уезжающей модалке ничего не делает', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');
        context.session.openRestoreDraftModal();
        context.session.handleRestoreDraft();
        expect(componentsStore.components.map((component) => component.id)).toEqual(['draft-1']);

        // Модалка ещё уезжает: второй клик — уже по «Удалить» — не должен ни снести
        // восстановленный черновик, ни тронуть канвас
        context.session.handleDiscardDraft();

        expect(getBuilderDraft('page-a')).not.toBeNull();
        expect(componentsStore.components.map((component) => component.id)).toEqual(['draft-1']);
    });

    it('перенос сессии снимает предложение, ничего не удаляя', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();
        const componentsStore = useComponentsStore();

        const pageA = buildPageWithComponent(1, 'page-a', 'a1');
        publishStore.publishedPages = [pageA];
        serverPages = [pageA];
        seedDraft('page-a', 1, 'draft-1');

        await context.session.openBuilderSession('page-a');
        expect(context.session.isDraftRestorePending.value).toBe(true);

        // Уже начатое сохранение доезжает и переносит сессию (renameSession зовут
        // напрямую и save, и Save as Copy) — поколение при этом не меняется, а
        // migrateBuilderDraft уже унёс запись под новый ключ
        await context.pagename.renameSession('renamed-page');
        await nextTick();

        // Предложение снято: отвечать больше не на что. Снято именно снятием, а не
        // применением — на канвасе осталась сохранённая версия
        expect(context.session.isDraftRestorePending.value).toBe(false);
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
