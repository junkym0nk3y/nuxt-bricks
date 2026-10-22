// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { nextTick, reactive, type EffectScope } from 'vue';

// Types
import type { IBuilderContext, IWindowStub } from '../helpers/types';

// Utils
import {
    AUTOSAVE_DEBOUNCE_MS,
    bareAddress,
    buildTestDraftKey,
    createWindowStub,
    mountBuilderContext,
    TEST_DRAFT_PRINCIPAL,
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

import { getBuilderDraft } from '../../src/runtime/modules/builder/publish/utils/draftStorage';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({
    pagename: 'home',
    title: 'Home',
    description: 'Landing page',
    keywords: 'landing',
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-30T10:00:00Z',
});

describe('черновик билдера: недоступное хранилище', () => {
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
    it('запрещённое хранилище сообщается сразу при открытии, а не после первой правки', async () => {
        windowStub.localStorage.setItem = vi.fn(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession(bareAddress('draft-page'));

        // Проба на готовности сессии: без неё пользователь узнал бы о неработающем
        // восстановлении только через окно debounce после первого изменения
        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(1);

        publishStore.setCurrentFormField('title', 'Первая правка');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        publishStore.setCurrentFormField('title', 'Вторая правка');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        // Автосейв продолжает пытаться (запрет может быть снят), но сообщение —
        // одно на сессию: на каждый тик debounce оно было бы шумом
        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(1);
    });

    it('отказ записи по ходу работы сообщается один раз, попытки продолжаются', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession(bareAddress('draft-page'));
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(context.draftStorageUnavailableMock).not.toHaveBeenCalled();

        // Хранилище было доступно на входе и отказало позже — проба такой случай
        // не ловит по определению
        const workingSetItem = windowStub.localStorage.setItem;
        windowStub.localStorage.setItem = vi.fn(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });

        publishStore.setCurrentFormField('title', 'Правка при полном хранилище');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        publishStore.setCurrentFormField('title', 'Ещё одна');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(1);

        // Механизм не выключен: как только запись снова проходит, черновик пишется
        windowStub.localStorage.setItem = workingSetItem;
        publishStore.setCurrentFormField('title', 'После освобождения');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        expect(
            getBuilderDraft(TEST_DRAFT_PRINCIPAL, bareAddress('draft-page'))?.draftSnapshot
                .formState.title
        ).toBe('После освобождения');
    });

    it('полностью запрещённое хранилище не срывает открытие страницы', async () => {
        // Запрет данных сайта роняет и чтение: раньше исключение `getItem`
        // выходило из `bootstrapSession` наружу, и вместо редактора пользователь
        // получал блокирующий экран отказа — из-за одного лишь черновика
        const denied = (): never => {
            throw new DOMException('denied', 'SecurityError');
        };
        windowStub.localStorage.getItem = vi.fn(denied);
        windowStub.localStorage.setItem = vi.fn(denied);
        windowStub.localStorage.removeItem = vi.fn(denied);

        const context = mountTracked();

        await context.session.openBuilderSession(bareAddress('draft-page'));

        expect(context.session.isSessionReady.value).toBe(true);
        expect(context.session.sessionError.value).toBeNull();
        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(1);
    });

    it('новая сессия сообщает о недоступном хранилище заново', async () => {
        windowStub.localStorage.setItem = vi.fn(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        const context = mountTracked();

        await context.session.openBuilderSession(bareAddress('draft-page'));
        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(1);

        // Переход на другую страницу билдера — новая сессия в том же экземпляре
        // страницы (page key статический). Латч по токену, а не по экземпляру,
        // именно поэтому: иначе предупреждение получила бы только первая страница
        routerBridge.route.params.pagename = 'other-page';
        await context.session.openBuilderSession(bareAddress('other-page'));

        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(2);
    });

    it('уход из редактора не показывает предупреждение задним числом', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession(bareAddress('draft-page'));
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(context.draftStorageUnavailableMock).not.toHaveBeenCalled();

        // Хранилище отказало ровно перед уходом со страницы: `flushDraft` на
        // остановке scope попробует записать черновик и получит отказ. Токен
        // сессии к этому моменту уже инвалидирован (dispose сессии
        // зарегистрирован раньше), поэтому латч по токену пропустил бы это
        // сообщение как «новую сессию» — и тост появился бы уже на дашборде
        windowStub.localStorage.setItem = vi.fn(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        publishStore.setCurrentFormField('title', 'Правка перед уходом');
        await nextTick();
        context.scope.stop();

        expect(context.draftStorageUnavailableMock).not.toHaveBeenCalled();
    });

    it('отказ удаления черновика не остаётся тихим', async () => {
        const context = mountTracked();

        await context.session.openBuilderSession(bareAddress('draft-page'));
        expect(context.draftStorageUnavailableMock).not.toHaveBeenCalled();

        // Хранилище отказало уже после входной пробы — на удалении. Страница
        // сохранена, черновик остался: при следующем заходе он снова предложит
        // восстановление, и пользователь должен знать, что фиксация не удалась
        windowStub.localStorage.removeItem = vi.fn(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        context.session.commitSavedSnapshot(context.sessionToken.capture());

        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(1);
    });

    it('отказ удаления совпавшего с сохранённым черновика тоже сообщается', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        seedLoadedPages(publishStore, [buildPage({ id: 7, pagename: 'draft-page' })]);
        await context.session.openBuilderSession(bareAddress('draft-page'));
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(context.draftStorageUnavailableMock).not.toHaveBeenCalled();

        // Правка и возврат к сохранённому состоянию: автосейв удаляет черновик
        // как ставший ненужным — эта ветка не пишет, а удаляет, и её отказ
        // раньше не доходил никуда
        windowStub.localStorage.removeItem = vi.fn(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        publishStore.setCurrentFormField('title', 'Правка');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        publishStore.setCurrentFormState(context.session.savedSnapshot.value!.formState);
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(1);
    });

    it('отказ переноса черновика при rename сообщается, но навигацию не срывает', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession(bareAddress('draft-page'));
        publishStore.setCurrentFormField('title', 'Черновик под старым слагом');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
        expect(context.draftStorageUnavailableMock).not.toHaveBeenCalled();

        // Перенос записал новый ключ, но старый не удалился: автосейв дальше
        // пишет по новому ключу и об этом не узнает, а черновик под прежним
        // слагом остался и позже предложит восстановление
        windowStub.localStorage.removeItem = vi.fn(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        await context.address.renameSession(bareAddress('renamed-page'));

        expect(context.draftStorageUnavailableMock).toHaveBeenCalledTimes(1);
        // Отказ переноса черновика не повод оставлять сессию на прежнем слаге
        expect(context.address.sessionAddress.value).toEqual(bareAddress('renamed-page'));
    });

    it('занятый ключ при rename — не отказ хранилища', async () => {
        const context = mountTracked();
        const publishStore = usePublishStore();

        await context.session.openBuilderSession(bareAddress('draft-page'));
        publishStore.setCurrentFormField('title', 'Черновик под старым слагом');
        await nextTick();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

        // Под целевым ключом лежит черновик другой страницы — обычная ситуация
        // «сессия владеет своим ключом», хранилище при этом исправно
        windowStub.localStorage.setItem(
            buildTestDraftKey(bareAddress('renamed-page')),
            JSON.stringify({ pagename: 'renamed-page' })
        );

        await context.address.renameSession(bareAddress('renamed-page'));

        expect(context.draftStorageUnavailableMock).not.toHaveBeenCalled();
        expect(context.address.sessionAddress.value).toEqual(bareAddress('renamed-page'));
        // Занятый ключ переносом не затирается: под ним лежит черновик другой
        // страницы, и «перенесли» вместо «ключ занят» уничтожило бы его молча
        expect(
            JSON.parse(
                windowStub.localStorage.getItem(buildTestDraftKey(bareAddress('renamed-page'))) ??
                    'null'
            )
        ).toEqual({ pagename: 'renamed-page' });
    });
});
