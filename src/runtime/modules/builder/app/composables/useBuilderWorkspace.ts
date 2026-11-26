// #region Imports
// Types
import type {
    IMediaGalleryPickFilter,
    IMediaItem,
    TMediaGalleryContext,
} from '../../../common/types/media';
import type { ISidebarExpose } from '../types/builder';
import type { IUseBuilderWorkspaceReturn, TBuilderWorkspaceOptions } from '../types/composables';

// Utils
import { setPublishStoreBackgroundColor } from '../../publish/utils/formState';

// Vue
import { computed, provide, ref, watch } from 'vue';

// Composables
import { useComponentLibraryDrag } from './useDraggableComponent';
import { useBuilderShortcuts } from './useBuilderShortcuts';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { useBricksConfig } from '../../../common/composables/useBricksConfig';
import { useBricksDevices } from '../../../common/composables/useBricksDevices';
import { findRemovedDeviceKeys } from '../../core/utils/deviceKeyCleanup';
import { BRICKS_DEVICES_KEY } from '../../../common/constants/injectionKeys';
import { useBricksStyles } from '../../../common/composables/useBricksStyles';
import { useResponsiveVisibilityStyles } from '../../../layouts-blocks/composables/useResponsiveVisibilityStyles';
import { useResponsiveLayoutStyles } from '../../../layouts-blocks/composables/useResponsiveLayoutStyles';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useSidebarStore } from '../../core/stores/sidebar';
import { useCanvasStore } from '../../core/stores/canvas';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * The editor around the canvas that a page and a template share: the device set and the
 * styles out of it, the drag out of the library, the hotkeys, the toast, the
 * documentation, the media gallery, the sidebar toggles and the reset of the teleported
 * surfaces on a change of session.
 *
 * Synchronous on purpose: every watcher of the editor is registered here, and a watcher
 * registered after an `await` of a composable is lost to the effect scope (see the await
 * of the library in `useBuilderComponentLibrary`).
 *
 * @param options - The bridge of the inline editor and the session token.
 * @returns The state of the workspace and its handlers.
 */
export function useBuilderWorkspace(options: TBuilderWorkspaceOptions): IUseBuilderWorkspaceReturn {
    const { inlineMediaBridge, sessionToken } = options;

    // #region Stores & Composables
    const componentsStore = useComponentsStore();
    const sidebarStore = useSidebarStore();
    const canvasStore = useCanvasStore();
    const publishStore = usePublishStore();
    const dragComposable = useComponentLibraryDrag();
    const bricksConfig = useBricksConfig();

    // The backgroundColor is cached for use in the store (outside a Vue context)
    setPublishStoreBackgroundColor(bricksConfig.backgroundColor || '#FFFFFF');

    // The device set is put in by the composition root: `builder/core` has no right
    // to import `builder/publish`, where the form with the `viewportConfig` lives. A
    // watcher rather than a one-off call on the bootstrap: the builder page is
    // deliberately not remounted on a change of the address, the set is edited by a
    // window and arrives with a restored draft — every one of these sources goes
    // through the form. `flush: 'sync'` — the canvas is mounted from the very
    // beginning (under the loader), and a deferred application would leave it at the
    // former sizes.
    const { resolvePageDevices } = useBricksDevices();

    watch(
        () => publishStore.currentFormState.viewportConfig,
        (config, previousConfig) => {
            const previousKeys = canvasStore.devices.map((device) => device.key);
            const devices = resolvePageDevices(config ?? null);

            canvasStore.setDevices(devices);

            // The first run (immediate) has nothing to compare against: there was
            // no former set yet, and every key of the schema would come out as
            // "disappeared"
            if (previousConfig === undefined) {
                return;
            }

            const removed = findRemovedDeviceKeys(
                previousKeys,
                devices.map((device) => device.key)
            );

            if (removed.size > 0) {
                componentsStore.stripDeviceKeys(removed);
            }
        },
        { immediate: true, deep: true, flush: 'sync' }
    );

    // The blocks that CSS variables are not enough for (the Slider builds the JS
    // breakpoints of Swiper) need the set as a value — it is handed over by
    // injection
    provide(
        BRICKS_DEVICES_KEY,
        computed(() => canvasStore.devices)
    );

    // That same set is the source of the CSS of the builder page: it displaces the
    // project tags of the plugin by their key, and the canvas gets the rules of its
    // own devices
    const getPageDevices = () => canvasStore.devices;

    useBricksStyles(getPageDevices);
    useResponsiveVisibilityStyles(getPageDevices);
    useResponsiveLayoutStyles(getPageDevices);

    provide('dragComposable', dragComposable);

    const { handleKeyDown } = useBuilderShortcuts();
    const { toast, showToast } = useBuilderToast();
    // #endregion

    // #region State
    const isDocumentationModalOpen = ref(false);
    // The gallery is mounted with the first opening only: mounted right away, it
    // used to pull the lists of the files and the categories at the start of the
    // builder — the ones nobody asks an unopened gallery for (the import of a schema
    // loads the media library itself). The latch is never lowered again, as with the
    // create-page window: recreating the component would lose the closing animation
    const shouldMountMediaGallery = ref(false);
    const isMediaGalleryModalOpen = ref(false);
    const mediaGalleryContext = ref<TMediaGalleryContext>('manager');
    const mediaGalleryPickFilter = ref<IMediaGalleryPickFilter | null>(null);
    const sidebarRef = ref<ISidebarExpose | null>(null);
    const propertiesPanelRef = ref<ISidebarExpose | null>(null);

    // The token of the session the gallery was opened in: the choice is applied to
    // the properties panel and to the sidebar of the current page, while the gallery
    // itself is teleported into body — that is, it lies outside the `inert` barrier
    // of the workspace and outlives a change of session
    let mediaGalleryToken: number | null = null;
    // #endregion

    // #region Sidebar toggles
    /**
     * Toggles the visibility of the component library in the sidebar.
     */
    function handleToggleLibrary(): void {
        sidebarStore.toggleSidebarView('components');
    }

    /**
     * Toggles the visibility of the component schema in the sidebar.
     */
    function handleToggleSchema(): void {
        sidebarStore.toggleSidebarView('schema');
    }
    // #endregion

    // #region Documentation
    /**
     * Opens the documentation window.
     */
    function handleOpenDocs(): void {
        isDocumentationModalOpen.value = true;
    }

    /**
     * Closes the documentation window.
     */
    function handleCloseDocs(): void {
        isDocumentationModalOpen.value = false;
    }
    // #endregion

    // #region Media gallery
    /**
     * Shows an error of the media gallery (an unreachable database, for one).
     *
     * @param message - The text of the error.
     */
    function handleMediaError(message: string): void {
        showToast(message, 'error');
    }

    /**
     * Opens the window of the media gallery.
     *
     * @param context - Who opens it: the manager or a picker.
     * @param pickFilter - Which files a picker offers; null — the default of the context.
     */
    function handleOpenMediaGallery(
        context: TMediaGalleryContext = 'manager',
        pickFilter: IMediaGalleryPickFilter | null = null
    ): void {
        mediaGalleryContext.value = context;
        mediaGalleryPickFilter.value = pickFilter;
        mediaGalleryToken = sessionToken.capture();
        shouldMountMediaGallery.value = true;
        isMediaGalleryModalOpen.value = true;
    }

    /**
     * Closes the window of the media gallery.
     */
    function handleCloseMediaGallery(): void {
        isMediaGalleryModalOpen.value = false;
        mediaGalleryContext.value = 'manager';
        mediaGalleryPickFilter.value = null;
        mediaGalleryToken = null;
        inlineMediaBridge.cancelMediaRequest();
    }

    /**
     * Handles the choice of a media item out of the gallery. It passes the chosen
     * item into the properties panel, the sidebar or the inline editor and closes
     * the gallery.
     *
     * @param item - The chosen media item.
     */
    function handleMediaSelect(item: IMediaItem): void {
        // A second barrier to the reset below: a leaving window can still give a
        // click away, while the targets of the choice (the properties panel, the
        // sidebar, the inline editor) belong to an already different page — as with
        // the draft restore window
        if (mediaGalleryToken !== null && !sessionToken.isCurrent(mediaGalleryToken)) {
            handleCloseMediaGallery();
            return;
        }

        if (inlineMediaBridge.isRequestingMedia.value) {
            inlineMediaBridge.resolveMediaRequest(item);
            isMediaGalleryModalOpen.value = false;
            mediaGalleryContext.value = 'manager';
            mediaGalleryPickFilter.value = null;
            mediaGalleryToken = null;
            return;
        }

        if (mediaGalleryContext.value === 'properties') {
            propertiesPanelRef.value?.handleMediaSelect(item);
        } else {
            sidebarRef.value?.handleMediaSelect(item);
        }
        isMediaGalleryModalOpen.value = false;
        mediaGalleryContext.value = 'manager';
        mediaGalleryPickFilter.value = null;
        mediaGalleryToken = null;
    }

    // The MediaGallery is opened when the inline editor asks for an image
    watch(inlineMediaBridge.isRequestingMedia, (requesting) => {
        if (requesting) {
            handleOpenMediaGallery('properties', inlineMediaBridge.mediaRequestFilter.value);
        }
    });
    // #endregion

    // #region Session reset
    // The surfaces teleported into body lie outside `.workspace`, so the `inert`
    // barrier of the workspace does not close them and they outlive a change of
    // session: the gallery writes a `socialImage` or a prop of a component through
    // the choice context of the former page; inline editing stays tied to a component
    // the new canvas does not hold (`loadSchema` resets `selectedComponent` alone). A
    // readiness check is not enough here — by the moment of the confirmation the new
    // session is ready already — so the opening of a session puts them out
    // explicitly.
    //
    // flush: 'sync' — the reset is obliged to happen at the moment the token is
    // invalidated rather than on the next tick: the opening of a session goes into an
    // await right away, and a deferred callback would run intermixed with the
    // bootstrap of the new one.
    watch(
        sessionToken.token,
        () => {
            inlineMediaBridge.cancelInlineEditing();
            handleCloseMediaGallery();
        },
        { flush: 'sync' }
    );
    // #endregion

    return {
        sidebarStore,
        isDocumentationModalOpen,
        shouldMountMediaGallery,
        isMediaGalleryModalOpen,
        mediaGalleryContext,
        mediaGalleryPickFilter,
        sidebarRef,
        propertiesPanelRef,
        toast,
        handleKeyDown,
        showToast,
        handleToggleLibrary,
        handleToggleSchema,
        handleOpenDocs,
        handleCloseDocs,
        handleMediaError,
        handleOpenMediaGallery,
        handleCloseMediaGallery,
        handleMediaSelect,
    };
}
