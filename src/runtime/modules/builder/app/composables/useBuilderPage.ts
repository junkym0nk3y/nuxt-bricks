// #region Imports
// Types
import type { IMediaItem, TMediaGalleryContext } from '../../../common/types/media';
import type { ISidebarExpose } from '../types/builder';
import type { IBuilderPageOptions, IUseBuilderPageReturn } from '../types/composables';

// Utils
import { setPublishStoreBackgroundColor } from '../../publish/utils/formState';
import { runSaveWhenSessionReady } from '../utils/sessionGuards';

// Vue
import { computed, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useComponentLibraryDrag } from './useDraggableComponent';
import { useComponentLibrary } from './useComponentLibrary';
import { useBuilderPageWrite } from './useBuilderPageWrite';
import { useBuilderShortcuts } from './useBuilderShortcuts';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePreviewSync } from './usePreviewSync';
import { usePublishPreview } from '../../publish/composables/usePublishPreview';
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
 * Assembles the whole business logic of the builder page and hands the Vue
 * component the states it needs alone.
 *
 * @param options - The bridge of the inline editor, the move and the commit of the
 * session, the session token; everything is assembled by the composition root
 * (`pages/[pagename].vue`) so that the core of the builder does not depend on the
 * editor and owns the session in one place.
 */
export async function useBuilderPage(options: IBuilderPageOptions): Promise<IUseBuilderPageReturn> {
    const {
        inlineMediaBridge,
        renameSession,
        switchToSavedPage,
        commitSavedSnapshot,
        sessionToken,
        isSessionReady,
    } = options;

    // #region Stores & Composables
    const { t } = useI18n();
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

    const { startPreviewSync } = usePreviewSync(sessionToken);
    const { previewCurrentPage } = usePublishPreview();
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

    // #region Publish handlers
    /**
     * Opens the panel of the publish settings. When the panel is not visible yet and
     * there is no draft data, it initializes a new publication.
     */
    function handleOpenPublishSettings(): void {
        const isPublishViewVisible =
            sidebarStore.left.visible && sidebarStore.activeView === 'publish';
        if (!isPublishViewVisible) {
            const { pagename, title, description } = publishStore.currentFormState;
            const hasDraftData =
                (pagename ?? '').trim().length > 0 ||
                (title ?? '').trim().length > 0 ||
                (description ?? '').trim().length > 0;

            if (!hasDraftData && publishStore.editingPageId === null) {
                publishStore.startNewPublish();
            } else {
                publishStore.clearErrors();
            }
        }
        sidebarStore.toggleSidebarView('publish');
    }

    /**
     * Guarantees the visibility of the panel of the publish settings. It always
     * opens the publish panel on validation errors, so that the fields are lit up.
     *
     * @param _message - The error message (not used directly).
     */
    function ensurePublishSettingsVisible(_message: string): void {
        handleOpenPublishSettings();
    }

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

    const {
        currentPublishPageTitle,
        handleSaveDraft: saveDraft,
        handleSaveAsCopy: saveAsCopy,
    } = useBuilderPageWrite({
        sessionToken,
        renameSession,
        switchToSavedPage,
        commitSavedSnapshot,
        ensurePublishSettingsVisible,
    });

    /**
     * Saves the page into a consistent session alone (the rule itself is in
     * `runSaveWhenSessionReady`). Every action of the toolbar that reads the canvas
     * asks about the readiness here rather than in the composition root: in a
     * template the rule could only be verified by its text, and such a check stays
     * green over, say, a lost `return`.
     */
    async function handleSaveDraft(): Promise<void> {
        await runSaveWhenSessionReady({
            isSessionReady: () => isSessionReady.value,
            save: saveDraft,
            onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
        });
    }

    /**
     * The same for the save of a copy.
     */
    async function handleSaveAsCopy(): Promise<void> {
        await runSaveWhenSessionReady({
            isSessionReady: () => isSessionReady.value,
            save: saveAsCopy,
            onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
        });
    }

    /**
     * Opens the preview of the current landing in a new tab. After the opening it
     * starts the synchronization — the changes on the canvas will show up in the
     * preview in real time.
     *
     * The readiness of the session is checked before the export rather than trusted
     * to the disabled state of the button: with the screen of a refused bootstrap up,
     * the toolbar deliberately stays live (the retry and the way out sit there), and
     * the canvas at that moment holds either nothing or the remains of the previous
     * page. A preview built out of those would be written into the preview storage
     * and shown as the page a person is looking at.
     */
    async function handlePreview(): Promise<void> {
        if (!isSessionReady.value) {
            showToast(t('bricks.publish.session.previewBlocked'), 'error');

            return;
        }

        const schema = componentsStore.exportSchema();
        const previewPagename = previewCurrentPage(schema);

        if (previewPagename && import.meta.client) {
            startPreviewSync(previewPagename);
        } else if (!previewPagename) {
            showToast(
                publishStore.generalError || t('bricks.publish.toasts.previewFailed'),
                'error'
            );
        }
    }

    /**
     * Shows an error of the media gallery (an unreachable database, for one).
     *
     * @param message - The text of the error.
     */
    function handleMediaError(message: string): void {
        showToast(message, 'error');
    }
    // #endregion

    // #region Media gallery
    /**
     * Opens the window of the media gallery.
     */
    function handleOpenMediaGallery(context: TMediaGalleryContext = 'manager'): void {
        mediaGalleryContext.value = context;
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
        mediaGalleryToken = null;
    }

    // The MediaGallery is opened when the inline editor asks for an image
    watch(inlineMediaBridge.isRequestingMedia, (requesting) => {
        if (requesting) {
            handleOpenMediaGallery('properties');
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
    // invalidated rather than on the next tick: `openBuilderSession` goes into an
    // await right away, and a deferred callback would run intermixed with the
    // bootstrap of the new page.
    watch(
        sessionToken.token,
        () => {
            inlineMediaBridge.cancelInlineEditing();
            handleCloseMediaGallery();
        },
        { flush: 'sync' }
    );
    // #endregion

    // The single await of the composable — and it is the last statement of the
    // wiring. After it the active effect scope is lost (`getCurrentScope()` →
    // undefined), and a `watch` registered in a lost scope does not stop on unmount:
    // every repeated visit to the builder would leave a live closure over dead refs,
    // and a mutation of a global store would poke the handlers of every past
    // instance. That is why the whole synchronous wiring (both watchers included)
    // goes above, while the component library is awaited here — its value is needed
    // in the return alone.
    const {
        componentLibraryList,
        skippedBricks,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading,
        refreshComponentLibrary,
    } = await useComponentLibrary();

    /**
     * Retries the load of the library on the button of the sidebar; a second refusal
     * is reported with a toast again — the button itself stays where it is.
     */
    async function handleRetryComponentLibrary(): Promise<void> {
        const isLoaded = await refreshComponentLibrary();

        if (!isLoaded) {
            showToast(t('bricks.library.loadFailed'), 'error');
        }
    }

    /**
     * Reports a refused load of the library. The showing is not done right here but
     * left to the page (its `onMounted`): the composable is awaited in setup, on SSR
     * too, where there is nobody to show a toast to, and the toast itself belongs to
     * the page — the page is what owns its mounting.
     *
     * The toast is needed together with the retry block in the sidebar rather than
     * instead of it: the block is visible only while the library is open, that is,
     * one could otherwise learn of a refusal by chance alone.
     *
     * A refusal and the skips may both be true at once (the list arrived out of the
     * snapshot of a previous load and the fresh request never came), but the toast is
     * one: the toast is a singleton, and a second one would simply overwrite the
     * first. The priority is with the refusal of the endpoint — it is both fresher
     * and mended by a retry.
     */
    function notifyComponentLibraryFailure(): void {
        if (isComponentLibraryLoadFailed.value) {
            showToast(t('bricks.library.loadFailed'), 'error');
            return;
        }

        if (skippedBricks.value.length > 0) {
            showToast(
                t('bricks.library.skippedBricks', { count: skippedBricks.value.length }),
                'error'
            );
        }
    }

    return {
        sidebarStore,
        publishStore,
        componentLibraryList,
        skippedBricks,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading,
        handleRetryComponentLibrary,
        notifyComponentLibraryFailure,
        isDocumentationModalOpen,
        shouldMountMediaGallery,
        isMediaGalleryModalOpen,
        mediaGalleryContext,
        sidebarRef,
        propertiesPanelRef,
        toast,
        currentPublishPageTitle,
        handleKeyDown,
        showToast,
        handleToggleLibrary,
        handleToggleSchema,
        handleOpenPublishSettings,
        handleOpenDocs,
        handleCloseDocs,
        handleMediaError,
        handleOpenMediaGallery,
        handleCloseMediaGallery,
        handleMediaSelect,
        handleSaveDraft,
        handleSaveAsCopy,
        handlePreview,
    };
}
