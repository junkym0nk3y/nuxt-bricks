// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { effectScope, reactive, ref, type EffectScope } from 'vue';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { TPublishedPageSummary } from '../../src/runtime/modules/common/types/bricks-api';
import type {
    IParsedSchemaFile,
    IUsePublishSchemaImportReturn,
} from '../../src/runtime/modules/builder/publish/types/composables';
// #endregion

/**
 * Импорт схемы из списка страниц — операция из нескольких асинхронных этапов
 * (подтверждение, ожидание медиатеки, модалка резолвера, PATCH), и всё это время
 * пользователь свободно ходит по списку. Подтверждение и резолвер лежат в body,
 * поэтому переживают смену выбранной страницы: без снимка цели и сверки поколения
 * схема, выбранная для одной страницы, перезаписала бы другую.
 */

// #region Mocks
const { toasts, publishStoreMock, resolverMock } = vi.hoisted(() => ({
    toasts: [] as Array<{ message: string; variant: string }>,
    resolverMock: {
        startResolving: vi.fn(),
        handleCancel: vi.fn(),
        isModalOpen: undefined as unknown,
        state: undefined as unknown,
    },
    publishStoreMock: {
        pages: [] as TPublishedPageSummary[],
        patchPage: vi.fn(),
    },
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/publish/stores/publish', () => ({
    usePublishStore: () => ({
        getPageById: (id: string | number) =>
            publishStoreMock.pages.find((page) => String(page.id) === String(id)),
        patchPage: publishStoreMock.patchPage,
    }),
}));

vi.mock('../../src/runtime/modules/builder/media/composables/useSchemaImageResolver', () => ({
    useSchemaImageResolver: () => ({
        isModalOpen: resolverMock.isModalOpen,
        state: resolverMock.state,
        startResolving: resolverMock.startResolving,
        handleConfirm: vi.fn(),
        handleCancel: resolverMock.handleCancel,
        handleSkip: vi.fn(),
        setImageAction: vi.fn(),
        setGlobalAction: vi.fn(),
    }),
}));
// #endregion

import { usePublishSchemaImport } from '../../src/runtime/modules/builder/publish/composables/usePublishSchemaImport';

/**
 * Собирает компонент схемы.
 *
 * @param id - Идентификатор компонента.
 * @returns Компонент схемы.
 */
function buildComponent(id: string): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'grid',
        brickPath: '/layouts/grid',
        zIndex: 1,
        props: {},
        children: [],
    };
}

/**
 * Собирает сводку страницы.
 *
 * @param id - Идентификатор страницы.
 * @param pagename - ЧПУ страницы.
 * @param revision - Ревизия строки.
 * @returns Сводка страницы.
 */
function buildPage(id: number, pagename: string, revision: number): TPublishedPageSummary {
    return {
        id,
        pagename,
        title: `Page ${pagename}`,
        description: '',
        keywords: '',
        backgroundColor: null,
        layout: null,
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: null,
        published: false,
        revision,
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
    };
}

/**
 * Собирает разобранный файл схемы.
 *
 * @param filename - Имя файла.
 * @returns Разобранный файл.
 */
function buildFile(filename: string): IParsedSchemaFile {
    return {
        schema: { components: [buildComponent('grid-1')] },
        filename,
        blocksCount: 1,
    };
}

/**
 * Поднимает координатор импорта с управляемым признаком выбранной страницы.
 *
 * @param selectedPageId - Реактивный id выбранной в списке страницы.
 * @returns Scope и API координатора.
 */
function mountCoordinator(selectedPageId: { value: string | null }): {
    scope: EffectScope;
    coordinator: IUsePublishSchemaImportReturn;
} {
    const scope = effectScope();

    const coordinator = scope.run(() =>
        usePublishSchemaImport({
            onNotify: (message, variant) => toasts.push({ message, variant }),
            isTargetSelected: (pageId) => selectedPageId.value === String(pageId),
        })
    ) as IUsePublishSchemaImportReturn;

    return { scope, coordinator };
}

/**
 * Проводит импорт до конца: подтверждение + уход диалога из DOM.
 *
 * @param coordinator - API координатора.
 * @returns Промис применения схемы.
 */
function confirmAndRun(coordinator: IUsePublishSchemaImportReturn): Promise<void> {
    coordinator.confirmReplace();
    return coordinator.handleConfirmationAfterLeave();
}

describe('импорт схемы в страницу из списка', () => {
    beforeEach(() => {
        toasts.length = 0;
        publishStoreMock.pages = [buildPage(1, 'page-a', 3), buildPage(2, 'page-b', 7)];
        publishStoreMock.patchPage.mockReset();
        publishStoreMock.patchPage.mockResolvedValue(undefined);
        resolverMock.startResolving.mockReset();
        resolverMock.handleCancel.mockReset();
        resolverMock.isModalOpen = ref(false);
        resolverMock.state = reactive({
            newImages: [],
            actions: new Map(),
            globalAction: 'keep',
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('подтверждение спрашивается до резолвера, а не после', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), buildFile('promo.json'));

        // Разбор файла состоялся, но картинки ещё никто не разбирал: пользователь
        // не должен тратить время на них ради операции, которую может отклонить
        expect(coordinator.isReplaceConfirmationOpen.value).toBe(true);
        expect(resolverMock.startResolving).not.toHaveBeenCalled();
        expect(publishStoreMock.patchPage).not.toHaveBeenCalled();

        scope.stop();
    });

    it('файл, доехавший после ухода на другую страницу, не просит подтверждения', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);

        // Чтение файла асинхронно и переживает смену страницы: секция снимает
        // страницу до чтения, а сюда файл приезжает уже после ухода на другую.
        // Подтверждение для неё предлагало бы перезаписать не то, что открывал
        // пользователь
        selected.value = '2';
        coordinator.requestPageImport(buildPage(1, 'page-a', 3), buildFile('promo.json'));

        expect(coordinator.isReplaceConfirmationOpen.value).toBe(false);
        expect(resolverMock.startResolving).not.toHaveBeenCalled();
        expect(publishStoreMock.patchPage).not.toHaveBeenCalled();
        // Молча: выбор относился к странице, которой на экране больше нет
        expect(toasts).toHaveLength(0);

        scope.stop();
    });

    it('отмена подтверждения не запускает ни резолвер, ни запись', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), buildFile('promo.json'));
        coordinator.closeReplaceConfirmation();
        // Диалог уезжает и после отмены — гасить в этот момент уже нечего
        await coordinator.handleConfirmationAfterLeave();

        expect(resolverMock.startResolving).not.toHaveBeenCalled();
        expect(publishStoreMock.patchPage).not.toHaveBeenCalled();

        scope.stop();
    });

    it('схема пишется с ревизией на момент выбора файла, а не с текущей', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);
        const file = buildFile('promo.json');

        resolverMock.startResolving.mockResolvedValue({
            schema: file.schema,
            isComparisonSkipped: false,
        });

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), file);
        await confirmAndRun(coordinator);

        expect(publishStoreMock.patchPage).toHaveBeenCalledWith(1, {
            schema: file.schema,
            expectedRevision: 3,
        });
        expect(toasts).toEqual([
            { message: 'bricks.publish.toasts.schemaImported', variant: 'success' },
        ]);

        scope.stop();
    });

    it('смена выбранной страницы во время резолвера отменяет запись', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);
        const file = buildFile('promo.json');

        let releaseResolver: ((value: unknown) => void) | undefined;
        resolverMock.startResolving.mockReturnValue(
            new Promise((resolve) => {
                releaseResolver = resolve;
            })
        );

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), file);
        const applying = confirmAndRun(coordinator);

        // Пользователь ушёл на другую страницу — цель импорта больше не выбрана
        selected.value = '2';
        coordinator.cancelImport();

        releaseResolver?.({ schema: file.schema, isComparisonSkipped: false });
        await applying;

        expect(publishStoreMock.patchPage).not.toHaveBeenCalled();

        scope.stop();
    });

    it('возврат на ту же страницу не оживляет прежнюю операцию', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);
        const file = buildFile('promo.json');

        let releaseResolver: ((value: unknown) => void) | undefined;
        resolverMock.startResolving.mockReturnValue(
            new Promise((resolve) => {
                releaseResolver = resolve;
            })
        );

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), file);
        const applying = confirmAndRun(coordinator);

        // Уход и возврат: сравнения id мало — подтверждение давалось до ухода
        selected.value = '2';
        coordinator.cancelImport();
        selected.value = '1';

        releaseResolver?.({ schema: file.schema, isComparisonSkipped: false });
        await applying;

        expect(publishStoreMock.patchPage).not.toHaveBeenCalled();

        scope.stop();
    });

    it('исчезновение страницы из списка во время резолвера отменяет запись', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);
        const file = buildFile('promo.json');

        let releaseResolver: ((value: unknown) => void) | undefined;
        resolverMock.startResolving.mockReturnValue(
            new Promise((resolve) => {
                releaseResolver = resolve;
            })
        );

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), file);
        const applying = confirmAndRun(coordinator);

        publishStoreMock.pages = publishStoreMock.pages.filter((page) => page.id !== 1);

        releaseResolver?.({ schema: file.schema, isComparisonSkipped: false });
        await applying;

        expect(publishStoreMock.patchPage).not.toHaveBeenCalled();

        scope.stop();
    });

    it('чужая запись во время резолвера отменяет импорт: ревизия разошлась', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);
        const file = buildFile('promo.json');

        let releaseResolver: ((value: unknown) => void) | undefined;
        resolverMock.startResolving.mockReturnValue(
            new Promise((resolve) => {
                releaseResolver = resolve;
            })
        );

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), file);
        const applying = confirmAndRun(coordinator);

        // Страницу изменили в другом месте, пока пользователь разбирал картинки:
        // подтверждение относилось к прежнему содержимому
        const target = publishStoreMock.pages.find((page) => page.id === 1);
        if (target) {
            target.revision = 4;
        }

        releaseResolver?.({ schema: file.schema, isComparisonSkipped: false });
        await applying;

        expect(publishStoreMock.patchPage).not.toHaveBeenCalled();

        scope.stop();
    });

    it('отмена резолвера отменяет всю операцию: подтверждение ничего не записало', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);

        resolverMock.startResolving.mockResolvedValue({
            schema: null,
            isComparisonSkipped: false,
        });

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), buildFile('promo.json'));
        await confirmAndRun(coordinator);

        expect(publishStoreMock.patchPage).not.toHaveBeenCalled();
        expect(toasts).toHaveLength(0);

        scope.stop();
    });

    it('второй импорт не вытесняет идущий, а получает отказ', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);
        const file = buildFile('promo.json');

        let releaseResolver: ((value: unknown) => void) | undefined;
        resolverMock.startResolving.mockReturnValue(
            new Promise((resolve) => {
                releaseResolver = resolve;
            })
        );

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), file);
        const applying = confirmAndRun(coordinator);

        // Вытеснение оставило бы промис первого резолвера неразрешённым навсегда
        coordinator.requestPageImport(buildPage(1, 'page-a', 3), buildFile('second.json'));

        expect(coordinator.isReplaceConfirmationOpen.value).toBe(false);
        expect(resolverMock.startResolving).toHaveBeenCalledTimes(1);
        expect(toasts).toEqual([
            { message: 'bricks.publish.dashboard.details.schema.busy', variant: 'error' },
        ]);

        releaseResolver?.({ schema: file.schema, isComparisonSkipped: false });
        await applying;

        scope.stop();
    });
});

describe('импорт схемы: сообщение о пропущенном сравнении с медиатекой', () => {
    beforeEach(() => {
        toasts.length = 0;
        publishStoreMock.pages = [buildPage(1, 'page-a', 3)];
        publishStoreMock.patchPage.mockReset();
        publishStoreMock.patchPage.mockResolvedValue(undefined);
        resolverMock.startResolving.mockReset();
        resolverMock.handleCancel.mockReset();
        resolverMock.isModalOpen = ref(false);
        resolverMock.state = reactive({
            newImages: [],
            actions: new Map(),
            globalAction: 'keep',
        });
    });

    it('пропущенное сравнение сообщается вместо обычного успеха', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);
        const file = buildFile('promo.json');

        resolverMock.startResolving.mockResolvedValue({
            schema: file.schema,
            isComparisonSkipped: true,
        });

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), file);
        await confirmAndRun(coordinator);

        // Ровно один тост: toast — синглтон, и сообщение об успехе стёрло бы
        // предупреждение, ради которого всё и затевалось
        expect(toasts).toEqual([
            { message: 'bricks.media.resolver.importedWithoutComparison', variant: 'error' },
        ]);

        scope.stop();
    });

    it('отказ записи не сопровождается обещанием, что схема импортирована', async () => {
        const selected = ref<string | null>('1');
        const { scope, coordinator } = mountCoordinator(selected);
        const file = buildFile('promo.json');

        resolverMock.startResolving.mockResolvedValue({
            schema: file.schema,
            isComparisonSkipped: true,
        });
        publishStoreMock.patchPage.mockRejectedValue(new Error('revision conflict'));

        coordinator.requestPageImport(buildPage(1, 'page-a', 3), file);
        await confirmAndRun(coordinator);

        // Сообщение об исходе показывается после записи, а не после резолвера:
        // иначе серверный отказ сопровождался бы «схема импортирована»
        expect(toasts).toEqual([{ message: 'revision conflict', variant: 'error' }]);

        scope.stop();
    });
});
