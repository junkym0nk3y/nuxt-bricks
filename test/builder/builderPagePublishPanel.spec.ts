// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, effectScope, ref, type EffectScope, type Ref } from 'vue';
// #endregion

/**
 * The publish panel after a refused write.
 *
 * The promise "the fields will be lit up" rested on opening the panel through the
 * toggle of the rail, and it held badly: with the panel already open the toggle
 * CLOSED it, and with the panel hidden it wiped `generalError` and the field errors
 * (`clearErrors`) before the showing — that is, the very text the panel is opened
 * for. The panel reads the reason out of the store itself, so no text is handed to
 * it; what is needed is an idempotent show that clears no state.
 *
 * The wiring of the page here is the one of `builderPageSaveToasts.spec.ts`: the
 * page composable is raised whole, and its dependencies are mocked by the same set.
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
        activeView: 'components' as string,
        showSidebarView: vi.fn(),
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

// The composable takes the device set out of runtimeConfig, and that one pulls
// `#build/nuxt.config.mjs`, which does not exist outside a Nuxt build
vi.mock('../../src/runtime/modules/common/composables/useBricksDevices', () => ({
    useBricksDevices: () => ({ projectDevices: [], resolvePageDevices: () => [] }),
}));

// The injection of styles into <head> has nothing to do with the save, while
// `useHead` asks for the context of a Nuxt application
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
 * Raises the builder page in an effectScope with a session token under control.
 *
 * @param overrides - The substitutable dependencies of the composition root (the
 * move of the session).
 * @returns The scope, the API of the page and the invalidation of the session.
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

describe('the publish panel after a refused write', () => {
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
        publishStoreMock.clearErrors.mockClear();
        publishStoreMock.startNewPublish.mockClear();
        sidebarStoreMock.showSidebarView.mockClear();
        sidebarStoreMock.toggleSidebarView.mockClear();
        sidebarStoreMock.left.visible = false;
        sidebarStoreMock.activeView = 'components';
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('a refusal with the publish panel open leaves it open', async () => {
        sidebarStoreMock.left.visible = true;
        sidebarStoreMock.activeView = 'publish';

        const { scope, page } = await mountBuilderPage();

        publishStoreMock.generalError = 'pagename is occupied';
        publishStoreMock.publishCurrentPage.mockResolvedValueOnce(null);

        await page.handleSaveDraft();

        // A show rather than a toggle: with the `publish` section visible a toggle
        // would hide the panel — and the person would see neither the lit fields nor
        // the reason
        expect(sidebarStoreMock.showSidebarView).toHaveBeenCalledWith('publish');
        expect(sidebarStoreMock.toggleSidebarView).not.toHaveBeenCalled();
        expect(sidebarStoreMock.hideSidebar).not.toHaveBeenCalled();

        scope.stop();
    });

    it('a refusal with the panel hidden opens it without wiping the reason', async () => {
        const { scope, page } = await mountBuilderPage();

        publishStoreMock.generalError = 'pagename is occupied';
        publishStoreMock.publishCurrentPage.mockResolvedValueOnce(null);

        await page.handleSaveDraft();

        expect(sidebarStoreMock.showSidebarView).toHaveBeenCalledWith('publish');
        // The panel reads `generalError` out of the store: a clear before the
        // showing would leave it empty and the field errors unlit
        expect(publishStoreMock.clearErrors).not.toHaveBeenCalled();
        expect(publishStoreMock.startNewPublish).not.toHaveBeenCalled();
        expect(publishStoreMock.generalError).toBe('pagename is occupied');

        scope.stop();
    });

    it('a refused Save as Copy opens the panel the same way', async () => {
        sidebarStoreMock.left.visible = true;
        sidebarStoreMock.activeView = 'publish';

        const { scope, page } = await mountBuilderPage();

        publishStoreMock.generalError = 'copy refused';
        publishStoreMock.saveCurrentPageAsCopy.mockResolvedValueOnce(null);

        await page.handleSaveAsCopy();

        expect(sidebarStoreMock.showSidebarView).toHaveBeenCalledWith('publish');
        expect(sidebarStoreMock.toggleSidebarView).not.toHaveBeenCalled();
        expect(publishStoreMock.clearErrors).not.toHaveBeenCalled();

        scope.stop();
    });
});
