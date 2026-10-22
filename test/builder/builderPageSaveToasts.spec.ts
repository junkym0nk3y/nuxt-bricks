// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, effectScope, ref, type EffectScope, type Ref } from 'vue';
// #endregion

/**
 * Сохранение, доехавшее после ухода на другую страницу, докладывалось тостом без
 * контекста: сообщение об уже покинутой странице выглядело относящимся к той, что
 * открыта. Ошибка вытесненной операции вдобавок читала `generalError` — поле формы
 * новой страницы.
 *
 * Здесь же — гард готовности сессии у предпросмотра: тулбар при отказе загрузки
 * намеренно живой, поэтому disabled у кнопки правилом не является.
 */

// #region Mocks
const {
    toasts,
    publishStoreMock,
    componentsStoreMock,
    sidebarStoreMock,
    componentLibraryMock,
    previewCurrentPageMock,
    startPreviewSyncMock,
} = vi.hoisted(() => ({
    toasts: [] as Array<{ message: string; variant: string }>,
    previewCurrentPageMock: vi.fn(() => ({ pagename: 'page-a', urlPrefix: 'blog' })),
    startPreviewSyncMock: vi.fn(),
    componentLibraryMock: {
        skippedBricks: [] as Array<{ name: string; brickPath: string; reason: string }>,
        isLoadFailed: false,
    },
    publishStoreMock: {
        currentFormState: {
            pagename: 'page-a',
            title: 'Page A',
            published: false,
            description: '',
        },
        generalError: '',
        editingPageId: 1 as string | number | null,
        publishCurrentPage: vi.fn(),
        saveCurrentPageAsCopy: vi.fn(),
        setCurrentFormField: vi.fn(),
        startEditingPage: vi.fn(),
        startNewPublish: vi.fn(),
        clearErrors: vi.fn(),
    },
    componentsStoreMock: {
        selectedComponent: null,
        exportSchema: vi.fn(() => ({ components: [] })),
        loadSchema: vi.fn(),
    },
    sidebarStoreMock: {
        left: { visible: false, width: '0px' },
        activeView: 'components',
        toggleSidebarView: vi.fn(),
        hideSidebar: vi.fn(),
    },
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            key === 'bricks.publish.toasts.forPage' && params
                ? `${String(params.page)}: ${String(params.message)}`
                : key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderToast', () => ({
    useBuilderToast: () => ({
        toast: { visible: false, message: '', variant: 'success', duration: 4000 },
        showToast: (message: string, variant = 'success') => {
            toasts.push({ message, variant });
        },
    }),
}));

vi.mock('../../src/runtime/modules/builder/publish/stores/publish', () => ({
    usePublishStore: () => publishStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => componentsStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/core/stores/canvas', () => ({
    useCanvasStore: () => ({ devices: [], setDevices: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/builder/core/stores/sidebar', () => ({
    useSidebarStore: () => sidebarStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/app/composables/useComponentLibrary', () => ({
    useComponentLibrary: () => ({
        componentLibraryList: computed(() => []),
        skippedBricks: computed(() => componentLibraryMock.skippedBricks),
        isComponentLibraryLoadFailed: computed(() => componentLibraryMock.isLoadFailed),
        isComponentLibraryLoading: computed(() => false),
        refreshComponentLibrary: vi.fn(),
    }),
}));

vi.mock('../../src/runtime/modules/builder/app/composables/useDraggableComponent', () => ({
    useComponentLibraryDrag: () => ({ startDrag: vi.fn(), endDrag: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/builder/app/composables/useBuilderShortcuts', () => ({
    useBuilderShortcuts: () => ({ handleKeyDown: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/builder/app/composables/usePageThumbnail', () => ({
    usePageThumbnail: () => ({ captureAndUploadThumbnail: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/builder/app/composables/usePreviewSync', () => ({
    usePreviewSync: () => ({ startPreviewSync: startPreviewSyncMock }),
}));

vi.mock('../../src/runtime/modules/builder/publish/composables/usePublishPreview', () => ({
    usePublishPreview: () => ({ previewCurrentPage: previewCurrentPageMock }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBricksConfig', () => ({
    useBricksConfig: () => ({ backgroundColor: '#FFFFFF' }),
}));

// Набор устройств композабл берёт из runtimeConfig, а тот тянет
// `#build/nuxt.config.mjs`, которого вне сборки Nuxt нет
vi.mock('../../src/runtime/modules/common/composables/useBricksDevices', () => ({
    useBricksDevices: () => ({ projectDevices: [], resolvePageDevices: () => [] }),
}));

// Инъекция стилей в <head> к сохранению отношения не имеет, а `useHead`
// требует контекста Nuxt-приложения
vi.mock('../../src/runtime/modules/common/composables/useBricksStyles', () => ({
    useBricksStyles: () => undefined,
}));

vi.mock(
    '../../src/runtime/modules/layouts-blocks/composables/useResponsiveVisibilityStyles',
    () => ({ useResponsiveVisibilityStyles: () => undefined })
);

vi.mock('../../src/runtime/modules/layouts-blocks/composables/useResponsiveLayoutStyles', () => ({
    useResponsiveLayoutStyles: () => undefined,
}));

// #endregion

// Starting the preview synchronization is a browser branch: without the flag it is
// unreachable, and the check below would be green on nothing
vi.stubGlobal('__BRICKS_TEST_CLIENT__', true);

import { useBuilderPage } from '../../src/runtime/modules/builder/app/composables/useBuilderPage';
import type { IUseBuilderPageReturn } from '../../src/runtime/modules/builder/app/types/composables';

/**
 * Поднимает страницу билдера в effectScope с управляемым токеном сессии.
 *
 * @param overrides - Подменяемые зависимости composition root'а (переход сессии).
 * @returns Scope, API страницы и функция инвалидации сессии.
 */
async function mountBuilderPage(
    overrides: { switchToSavedPage?: () => Promise<void>; isSessionReady?: Ref<boolean> } = {}
): Promise<{
    scope: EffectScope;
    page: IUseBuilderPageReturn;
    invalidateSession: () => void;
}> {
    const scope = effectScope();
    const token = ref(0);

    const sessionToken = {
        token: computed(() => token.value),
        capture: () => token.value,
        isCurrent: (captured: number) => captured === token.value,
        invalidate: () => {
            token.value += 1;
        },
    };

    const page = await (scope.run(() =>
        useBuilderPage({
            inlineMediaBridge: {
                isRequestingMedia: computed(() => false),
                resolveMediaRequest: vi.fn(),
                cancelMediaRequest: vi.fn(),
                cancelInlineEditing: vi.fn(),
            },
            renameSession: vi.fn(async () => undefined),
            switchToSavedPage: overrides.switchToSavedPage ?? vi.fn(async () => undefined),
            commitSavedSnapshot: vi.fn(),
            sessionToken,
            isSessionReady: overrides.isSessionReady ?? ref(true),
        })
    ) as Promise<IUseBuilderPageReturn>);

    return { scope, page, invalidateSession: sessionToken.invalidate };
}

describe('страница билдера: тосты операции, доехавшей в другую сессию', () => {
    beforeEach(() => {
        toasts.length = 0;
        publishStoreMock.generalError = '';
        publishStoreMock.currentFormState = {
            pagename: 'page-a',
            title: 'Page A',
            published: false,
            description: '',
        };
        publishStoreMock.publishCurrentPage.mockReset();
        publishStoreMock.saveCurrentPageAsCopy.mockReset();
        componentLibraryMock.skippedBricks = [];
        componentLibraryMock.isLoadFailed = false;
        componentsStoreMock.exportSchema.mockClear();
        previewCurrentPageMock.mockClear();
        startPreviewSyncMock.mockClear();
        // provide() вне setup-компонента предупреждает в консоль — здесь это шум
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('успех вытесненного сохранения называет свою страницу, а не открытую', async () => {
        const { scope, page, invalidateSession } = await mountBuilderPage();

        let resolveSave: ((id: number | null) => void) | undefined;
        publishStoreMock.publishCurrentPage.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveSave = resolve;
                })
        );

        const saving = page.handleSaveDraft();

        // Пользователь ушёл на другую страницу, пока летел POST: форма уже её
        invalidateSession();
        publishStoreMock.currentFormState = {
            pagename: 'page-b',
            title: 'Page B',
            published: false,
            description: '',
        };

        resolveSave?.(7);
        await saving;

        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.message).toContain('Page A');
        expect(toasts[0]?.message).not.toContain('Page B');

        scope.stop();
    });

    it('отказ вытесненного сохранения не берёт текст из формы открытой страницы', async () => {
        const { scope, page, invalidateSession } = await mountBuilderPage();

        let resolveSave: ((id: number | null) => void) | undefined;
        publishStoreMock.publishCurrentPage.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveSave = resolve;
                })
        );

        const saving = page.handleSaveDraft();

        invalidateSession();
        publishStoreMock.currentFormState = {
            pagename: 'page-b',
            title: 'Page B',
            published: false,
            description: '',
        };
        // Ошибка формы новой страницы: к вытесненной операции она не относится
        publishStoreMock.generalError = 'pagename page-b is occupied';

        resolveSave?.(null);
        await saving;

        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.variant).toBe('error');
        expect(toasts[0]?.message).toContain('Page A');
        expect(toasts[0]?.message).not.toContain('page-b');

        scope.stop();
    });

    it('тост актуального сохранения остаётся без метки страницы', async () => {
        const { scope, page } = await mountBuilderPage();

        publishStoreMock.publishCurrentPage.mockResolvedValueOnce(7);

        await page.handleSaveDraft();

        // Страница на экране — та же, метка была бы шумом
        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.message).not.toContain('Page A');

        scope.stop();
    });

    it('уход со страницы во время перехода на копию не даёт тост без контекста', async () => {
        let resolveSwitch: (() => void) | undefined;
        const switchToSavedPage = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveSwitch = resolve;
                })
        );

        const { scope, page, invalidateSession } = await mountBuilderPage({ switchToSavedPage });

        publishStoreMock.saveCurrentPageAsCopy.mockResolvedValueOnce({
            id: 9,
            pagename: 'page-a-copy',
            title: 'Page A copy',
        });

        const copying = page.handleSaveAsCopy();

        // Переход ждёт router.replace — вторая асинхронная граница, за которой
        // пользователя могло увести на другую страницу
        await vi.waitFor(() => {
            expect(resolveSwitch).toBeDefined();
        });
        invalidateSession();
        resolveSwitch?.();
        await copying;

        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.message).toContain('Page A copy');

        scope.stop();
    });

    it('успех вытесненного Save as Copy называет созданную копию', async () => {
        const { scope, page, invalidateSession } = await mountBuilderPage();

        let resolveCopy: ((copy: unknown) => void) | undefined;
        publishStoreMock.saveCurrentPageAsCopy.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveCopy = resolve;
                })
        );

        const copying = page.handleSaveAsCopy();

        invalidateSession();
        publishStoreMock.currentFormState = {
            pagename: 'page-b',
            title: 'Page B',
            published: false,
            description: '',
        };

        resolveCopy?.({ id: 9, pagename: 'page-a-copy', title: 'Page A copy' });
        await copying;

        // Искать в списке пользователь будет копию, а не исходную страницу
        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.message).toContain('Page A copy');

        scope.stop();
    });

    it('о пропущенных бриках сообщается, даже когда сама ручка ответила', async () => {
        componentLibraryMock.skippedBricks = [
            {
                name: 'NoLoader',
                brickPath: '/components/NoLoader.brick.ts',
                reason: 'loader-missing',
            },
        ];

        const { scope, page } = await mountBuilderPage();

        page.notifyComponentLibraryFailure();

        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.message).toBe('bricks.library.skippedBricks');

        scope.stop();
    });

    it('отказ ручки важнее пропусков: тост один и про отказ', async () => {
        componentLibraryMock.isLoadFailed = true;
        componentLibraryMock.skippedBricks = [
            {
                name: 'NoLoader',
                brickPath: '/components/NoLoader.brick.ts',
                reason: 'loader-missing',
            },
        ];

        const { scope, page } = await mountBuilderPage();

        page.notifyComponentLibraryFailure();

        // Второй тост затёр бы первый — синглтон; отказ и свежее, и чинится повтором
        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.message).toBe('bricks.library.loadFailed');

        scope.stop();
    });
});

describe('гард готовности сессии: сохранения и предпросмотр', () => {
    beforeEach(() => {
        toasts.length = 0;
        publishStoreMock.publishCurrentPage.mockReset();
        publishStoreMock.saveCurrentPageAsCopy.mockReset();
        componentsStoreMock.exportSchema.mockClear();
        previewCurrentPageMock.mockClear();
        startPreviewSyncMock.mockClear();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('несогласованная сессия: PUT не уходит, человек получает сообщение', async () => {
        const { scope, page } = await mountBuilderPage({ isSessionReady: ref(false) });

        await page.handleSaveDraft();

        // До готовности форма и editingPageId уже заполнены, а схемы на канвасе
        // ещё нет: PUT перезаписал бы страницу в базе пустым канвасом
        expect(publishStoreMock.publishCurrentPage).not.toHaveBeenCalled();
        expect(toasts).toEqual([
            { message: 'bricks.publish.session.saveBlocked', variant: 'error' },
        ]);

        scope.stop();
    });

    it('несогласованная сессия: копия тоже не сохраняется', async () => {
        const { scope, page } = await mountBuilderPage({ isSessionReady: ref(false) });

        await page.handleSaveAsCopy();

        expect(publishStoreMock.saveCurrentPageAsCopy).not.toHaveBeenCalled();
        expect(toasts).toEqual([
            { message: 'bricks.publish.session.saveBlocked', variant: 'error' },
        ]);

        scope.stop();
    });

    it('несогласованная сессия: канвас не экспортируется и превью не открывается', async () => {
        const { scope, page } = await mountBuilderPage({ isSessionReady: ref(false) });

        await page.handlePreview();

        // Экспорт до готовности отдал бы либо пустой канвас, либо остатки прошлой
        // страницы — и они уехали бы в хранилище превью как открытая страница
        expect(componentsStoreMock.exportSchema).not.toHaveBeenCalled();
        expect(previewCurrentPageMock).not.toHaveBeenCalled();
        expect(startPreviewSyncMock).not.toHaveBeenCalled();
        expect(toasts).toEqual([
            { message: 'bricks.publish.session.previewBlocked', variant: 'error' },
        ]);

        scope.stop();
    });

    it('готовность читается на каждый вызов, а не при создании страницы', async () => {
        const isSessionReady = ref(false);
        const { scope, page } = await mountBuilderPage({ isSessionReady });

        await page.handlePreview();
        await page.handleSaveDraft();
        isSessionReady.value = true;
        await page.handlePreview();
        await page.handleSaveDraft();

        expect(previewCurrentPageMock).toHaveBeenCalledTimes(1);
        expect(publishStoreMock.publishCurrentPage).toHaveBeenCalledTimes(1);
        // The synchronization starts on the whole address: same-named pages under
        // different prefixes are different, and by the name alone it would travel
        // into a tab of another page
        expect(startPreviewSyncMock).toHaveBeenCalledWith(
            expect.objectContaining({ urlPrefix: 'blog' })
        );

        scope.stop();
    });
});
