// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, effectScope, ref, type EffectScope } from 'vue';
// #endregion

/**
 * Сохранение, доехавшее после ухода на другую страницу, докладывалось тостом без
 * контекста: сообщение об уже покинутой странице выглядело относящимся к той, что
 * открыта. Ошибка вытесненной операции вдобавок читала `generalError` — поле формы
 * новой страницы.
 */

// #region Mocks
const { toasts, publishStoreMock, componentsStoreMock, sidebarStoreMock, componentLibraryMock } =
    vi.hoisted(() => ({
        toasts: [] as Array<{ message: string; variant: string }>,
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
    usePreviewSync: () => ({ startPreviewSync: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/builder/publish/composables/usePublishPreview', () => ({
    usePublishPreview: () => ({ previewCurrentPage: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBricksConfig', () => ({
    useBricksConfig: () => ({ backgroundColor: '#FFFFFF' }),
}));

// #endregion

import { useBuilderPage } from '../../src/runtime/modules/builder/app/composables/useBuilderPage';
import type { IUseBuilderPageReturn } from '../../src/runtime/modules/builder/app/types/composables';

/**
 * Поднимает страницу билдера в effectScope с управляемым токеном сессии.
 *
 * @param overrides - Подменяемые зависимости composition root'а (переход сессии).
 * @returns Scope, API страницы и функция инвалидации сессии.
 */
async function mountBuilderPage(
    overrides: { switchToSavedPage?: () => Promise<void> } = {}
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
