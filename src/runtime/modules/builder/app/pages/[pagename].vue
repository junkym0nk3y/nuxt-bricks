<script setup lang="ts">
// #region Imports
// Types
import type { TMediaGalleryContext } from '../../../common/types/media';

// Vue
import {
    computed,
    defineAsyncComponent,
    onBeforeUnmount,
    onMounted,
    onScopeDispose,
    ref,
    watch,
} from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { definePageMeta, useHead, useRouter, useCookie } from '#imports';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useSidebarStore } from '../../core/stores/sidebar';
import { usePublishStore } from '../../publish/stores/publish';
import { useInlineEditingStore } from '../../../text-editor/stores/inlineEditing';

// Composables
import { useBuilderPage } from '../composables/useBuilderPage';
import { useBuilderPageSelector } from '../composables/useBuilderPageSelector';
import { useBuilderSessionAddress } from '../composables/useBuilderSessionAddress';
import { useBuilderSession } from '../composables/useBuilderSession';
import { useBuilderSessionToken } from '../composables/useBuilderSessionToken';
import { useBuilderDraftPersistence } from '../composables/useBuilderDraftPersistence';
import { useBuilderSessionAddressSync } from '../composables/useBuilderSessionAddressSync';
import { useBuilderTemplateSave } from '../composables/useBuilderTemplateSave';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { usePropertiesPanelAvailability } from '../../core/composables/usePropertiesPanelAvailability';
import { useAuthProfile } from '../../auth/composables/useAuthProfile';
import { useAuthProfileModal } from '../../auth/composables/useAuthProfileModal';
import { useAuthSession } from '../../auth/composables/useAuthSession';

// Utils
import { createDraftStorageNotice } from '../utils/draftStorageNotice';
import { loadFavoritesFromStorage } from '../../core/stores/actions/favorites';
import { runSaveWhenSessionReady, withSessionReadyGuard } from '../utils/sessionGuards';
import { BRICKS_ROUTE_NAMES } from '../../../common/constants/routes';

// Components
import TheBuilderShellToolbar from '../../shell/toolbar/components/TheBuilderShellToolbar.vue';
import BuilderShellToolbarVerticalNav from '../../shell/toolbar/components/BuilderShellToolbarVerticalNav.vue';
import TheBuilderShellSidebar from '../../shell/sidebar/components/TheBuilderShellSidebar.vue';
import TheBuilderShellSidebarPropertiesPanel from '../../shell/sidebar/components/TheBuilderShellSidebarPropertiesPanel.vue';
import TheBuilderCanvas from '../../canvas/viewport/components/TheBuilderCanvas.vue';
import TheBuilderLoader from '../components/TheBuilderLoader.vue';
import TheBuilderSessionError from '../components/TheBuilderSessionError.vue';
import TheBuilderDraftRestoreModal from '../components/TheBuilderDraftRestoreModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';

// The windows are lazy chunks. The ones below a `v-if` need that condition as much
// as the import: without it the chunk would travel out by the first render and the
// laziness would be on paper only. A mount latch is never lowered again — a
// recreated component loses its closing animation
const TheBuilderDocumentationModal = defineAsyncComponent(
    () => import('../../documentation/components/TheBuilderDocumentationModal.vue')
);
const TheBuilderMediaGalleryModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaGalleryModal.vue')
);
const TheBuilderPublishCreatePageModal = defineAsyncComponent(
    () => import('../../publish/components/TheBuilderPublishCreatePageModal.vue')
);
const TheBuilderMediaImageResolverModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaImageResolverModal.vue')
);
const TheBuilderAuthProfileModal = defineAsyncComponent(
    () => import('../../auth/components/TheBuilderAuthProfileModal.vue')
);
const TheBuilderTemplatesSaveModal = defineAsyncComponent(
    () => import('../../templates/components/TheBuilderTemplatesSaveModal.vue')
);
// #endregion

// #region Meta
definePageMeta({
    layout: 'bricks',
    // A static page key: the default key of Nuxt is the interpolated path, which
    // would make a change of :pagename remount the page. A rename of the session
    // (`useBuilderSessionAddress.renameSession`) stays on a live canvas; a navigation
    // onto another page is handled by the watcher of useBuilderSession.
    key: 'bricks-builder-pagename',
});
// #endregion

// #region Data
const { t, locale, setLocale } = useI18n();
const router = useRouter();

const componentsStore = useComponentsStore();
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();

// The toast is a module singleton (useBuilderToast): useBuilderSession needs it
// before useBuilderPage does, and useBuilderPage needs switchToSavedPage in turn
const { showToast, showActionToast, hideToast } = useBuilderToast();

// The rights and the profile of the session. One request covers both states: the
// role of `ensureRole` is taken out of the profile already received (why there is a
// request at all — in useBuilderPermissions)
const { canEdit, canChangePassword, ensureRole } = useBuilderPermissions();
const { logout } = useAuthSession();
const { profile, ensureProfile } = useAuthProfile();
const profileModal = useAuthProfileModal();

await ensureProfile();
await ensureRole(() => Promise.resolve(profile.value?.role ?? null));

// The session token — the shared cut-off point of the operations that outlive the
// session they began in; useBuilderSession owns the increments, the rest only read
const sessionToken = useBuilderSessionToken();

// The message about an unreachable draft storage. `stop()` is registered here,
// before every other cleanup hook: the cleanups run in the order of their
// registration, and the last thing a leaving page does is the synchronous flush of
// the draft — a refusal of that would otherwise show a toast over the dashboard
const draftStorageNotice = createDraftStorageNotice({
    captureSessionToken: sessionToken.capture,
    // Longer than usual: the message speaks of a standing condition of the work in
    // this session rather than of a one-off failure, and it will not be repeated
    notify: () => showToast(t('bricks.publish.draft.storageUnavailable'), 'error', 10000),
});
onScopeDispose(() => {
    draftStorageNotice.stop();
});

// The owner of the address of the session: the URL and the key of the drafts
const { routeAddress, sessionAddress, renameSession } = useBuilderSessionAddress({
    draftStorageNotice,
});

// The builder session: the opening of a page, the drafts and the move onto a copy
const {
    isSessionLoading,
    isSessionReady,
    sessionError,
    sessionPageId,
    isDraftRestorePending,
    isRestoreDraftModalOpen,
    pendingDraft,
    savedSnapshot,
    buildCurrentSnapshot,
    commitSavedSnapshot,
    switchToSavedPage,
    openBuilderSession,
    retryBuilderSession,
    openRestoreDraftModal,
    handleDeferDraft,
    handleRestoreDraft,
    handleDiscardDraft,
} = useBuilderSession({
    routeAddress,
    sessionAddress,
    showToast,
    renameSession,
    sessionToken,
    draftStorageNotice,
    canEdit,
});

// The bridge of the inline editor: the editor is connected here alone
const inlineEditingStore = useInlineEditingStore();
const builder = await useBuilderPage({
    inlineMediaBridge: {
        isRequestingMedia: computed(() => inlineEditingStore.isRequestingMedia),
        resolveMediaRequest: (item) => inlineEditingStore.resolveMediaRequest(item),
        cancelMediaRequest: () => inlineEditingStore.cancelMediaRequest(),
        cancelInlineEditing: () => inlineEditingStore.stopEditing(),
    },
    renameSession,
    switchToSavedPage,
    commitSavedSnapshot,
    sessionToken,
});

const {
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
    isEditingExistingPage,
    hasSelectedComponent,
    leftSidebarOffset,
    currentPublishPageTitle,
    handleKeyDown,
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
} = builder;

// The loader is on the screen. Apart from `isSessionReady`, because the two always
// diverge: a session opens faster than the animation cycle of the loader runs, and
// in that tail (up to about 2 s on a quick load) the interface is released already
// while a person sees "loading" — the clicks into the toolbar and the rail used to go
// under the loader. It starts true: the loader is mounted along with the page
const isLoaderVisible = ref(true);

// The number of the showing of the toast offering to restore a draft: it is what
// puts the toast out as well. By the number rather than by a visibility flag — the
// state of the toast is one per application, and somebody else's message that
// replaced ours must not be taken down
const draftToastToken = ref<number | null>(null);

const darkModeCookie = useCookie<boolean>('bricks-dark-mode', {
    default: () => false,
    maxAge: 60 * 60 * 24 * 365,
});
const isDarkMode = ref(darkModeCookie.value ?? false);

// The page selector in the toolbar: the list, the move and the creation of a page
const {
    isPagesRefreshing,
    shouldMountCreatePageModal,
    isCreatePageModalOpen,
    schemaImport,
    handleOpenPageSelector,
    handleSelectPage,
    handleOpenCreatePage,
    handleCloseCreatePage,
    handlePageCreated,
} = useBuilderPageSelector({
    sessionPageId,
    routeAddress,
    sessionToken,
    showToast,
});

// The hotkeys work in a consistent session only (the rule is in sessionGuards)
const handleGuardedKeyDown = withSessionReadyGuard<KeyboardEvent>(
    () => isSessionReady.value,
    handleKeyDown
);

// The autosave of the draft plus the sync of the URL with the address of the form
useBuilderDraftPersistence({
    routeAddress,
    sessionAddress,
    isSessionLoading,
    isSessionReady,
    isDraftRestorePending,
    savedSnapshot,
    buildCurrentSnapshot,
    draftStorageNotice,
    canEdit,
});
useBuilderSessionAddressSync({ renameSession, isSessionReady });

// A template out of the canvas: the source, the session guard and the form
const templateSave = useBuilderTemplateSave({ isSessionReady, showToast });

// The properties panel on the right is mounted below by `canEdit`: an editing
// surface is taken away from an observer whole rather than dimmed field by field.
// The selection of a block goes on working — it is the highlight on the canvas
usePropertiesPanelAvailability(canEdit);
// #endregion

// #region Computed
const toastDuration = computed<number>(() => toast.duration ?? 4000);

// The interface is closed while the session is inconsistent OR while the loader is
// on the screen: the loader promises that work is not possible yet, and the promise
// has to be true. The error screen is the exception — it lies over the workspace
// itself and holds the only actions left (the retry and the way onto the dashboard).
// Over it for the pointer, that is: Tab still reaches the workspace behind it.
//
// What is at stake is a silently lost edit: before readiness the autosave turns one
// down by !isSessionReady, the canvas is then overwritten by the incoming schema,
// and an edit of the form travels into savedSnapshot as "already saved", so no draft
// is created and a reload loses it. Hence three layers in the markup, none of them
// enough alone. The transparent blocker (`cursor: progress` its only visible sign,
// `position: fixed` because the root is not positioned) holds the pointer, while the
// keyboard, an already focused field and the accessibility tree walk past it — that
// half is closed by `inert` on `.workspace` and on the toolbar. The toolbar is a
// neighbor of the workspace rather than a part of it, so both it and the blocker sit
// in the root: its buttons hold the way onto the dashboard, the very path the edits
// used to be lost on.
const isBuilderLocked = computed<boolean>(
    () => !sessionError.value && (!isSessionReady.value || isLoaderVisible.value)
);
const isPublishSettingsComplete = computed<boolean>(() => {
    const { pagename, title, description } = publishStore.currentFormState;
    return Boolean((pagename ?? '').trim() && (title ?? '').trim() && (description ?? '').trim());
});

const isLibraryActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'components'
);
const isPublishSettingsActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'publish'
);
const isSchemaActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'schema'
);
// #endregion

// #region Methods
/** Opens the pages manager — the `/bricks` dashboard; the draft outlives the move */
async function handleOpenPagesManager(): Promise<void> {
    await router.push({ name: BRICKS_ROUTE_NAMES.builderIndex });
}

/**
 * Repeats the opening of a session from the blocking error screen.
 */
async function handleRetrySession(): Promise<void> {
    await retryBuilderSession();
}

/**
 * Keeps the offer to restore a draft on the screen until it has been answered: the
 * toast is the only path to the window with the choice, and it must not be lost — it
 * can leave not only by the will of the person, somebody else's message may displace
 * it (the state of the toast is one per application).
 */
function ensureDraftToast(): void {
    const isOwnToastVisible =
        draftToastToken.value !== null && toast.visible && toast.token === draftToastToken.value;

    if (!isDraftRestorePending.value || isOwnToastVisible) {
        return;
    }

    draftToastToken.value = showActionToast({
        message: t('bricks.publish.draft.pendingTitle'),
        actionLabel: t('bricks.publish.draft.pendingAction'),
        variant: 'info',
        // The button is the short path: the person has chosen the restore already,
        // and the window would ask the same thing a second time. A click on the body
        // leads into the window: the date of the draft and the removal are there
        onAction: handleRestoreDraft,
        onSelect: openRestoreDraftModal,
    });
}

/**
 * The loader has left the screen: the interface is released, and when the session
 * holds an unanswered draft this is the very time to offer it. Any earlier is not
 * allowed: a window and a toast in the middle of a load would spoil the look of the
 * loader.
 */
function handleLoaderHidden(): void {
    isLoaderVisible.value = false;
    ensureDraftToast();
}

/**
 * Saves the page when the session is consistent (the rule is in
 * `runSaveWhenSessionReady`).
 */
async function handleSaveDraftGuarded(): Promise<void> {
    await runSaveWhenSessionReady({
        isSessionReady: () => isSessionReady.value,
        save: handleSaveDraft,
        onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
    });
}

/**
 * Saves the page as a copy when the session is consistent.
 */
async function handleSaveAsCopyGuarded(): Promise<void> {
    await runSaveWhenSessionReady({
        isSessionReady: () => isSessionReady.value,
        save: handleSaveAsCopy,
        onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
    });
}

/**
 * Delegates the opening of the media gallery with a context.
 *
 * @param context - The context of the call.
 */
function handleOpenMediaGalleryWithContext(context?: TMediaGalleryContext): void {
    handleOpenMediaGallery(context);
}

/**
 * Toggles the dark and light theme of the builder and saves the choice in a cookie.
 */
function handleToggleDarkMode(): void {
    isDarkMode.value = !isDarkMode.value;
    darkModeCookie.value = isDarkMode.value;
}

/**
 * Toggles the locale of the interface (ru ⇄ en); the `bricks-locale` cookie is
 * written by i18n itself.
 */
async function handleToggleLocale(): Promise<void> {
    await setLocale(locale.value === 'ru' ? 'en' : 'ru');
}

/**
 * Signs out of the session; on a refusal it shows a toast. There is no confirmation
 * on purpose: an unsaved edit is not lost — the move takes the page away, `pagehide`
 * synchronously writes the deferred draft out, and after the next sign-in the builder
 * will offer to restore it.
 */
async function handleLogout(): Promise<void> {
    try {
        await logout();
    } catch {
        showToast(t('bricks.auth.logoutFailed'), 'error');
    }
}
// #endregion

// #region Watchers
// A reopening of the session raises the loader anew — and the block with it
watch(isSessionLoading, (isLoading) => {
    if (!isLoading) {
        return;
    }

    isLoaderVisible.value = true;
});

// The offer is taken down — so is the toast: its own life ends together with the
// offer, the case where the first edit displaced it included (after one there is
// nothing to restore, the autosave has rewritten the draft with the current state)
watch(isDraftRestorePending, (isPending) => {
    if (isPending || draftToastToken.value === null) {
        return;
    }

    hideToast(draftToastToken.value);
    draftToastToken.value = null;
});

// The window was closed without an answer — the question comes back onto the screen
// (see `ensureDraftToast`). On an answer an offer already taken down arrives here
watch(isRestoreDraftModalOpen, (isOpen) => {
    if (isOpen) {
        return;
    }

    ensureDraftToast();
});
// #endregion

// #region Lifecycle
/**
 * The class of body is built reactively: it includes bricks-dark under the active
 * dark theme. It works on SSR — the cookie is read on the server and the class is
 * rendered at once.
 */
const bodyClass = computed(() => (isDarkMode.value ? 'bricks-page bricks-dark' : 'bricks-page'));

useHead({
    bodyAttrs: {
        class: bodyClass,
    },
});

onMounted(() => {
    window.addEventListener('keydown', handleGuardedKeyDown);
    componentsStore.favorites = loadFavoritesFromStorage();
    notifyComponentLibraryFailure();

    if (routeAddress.value.pagename) {
        openBuilderSession(routeAddress.value).catch((error: unknown) => {
            console.error('[Builder] Failed to open builder session:', error);
        });
    }
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGuardedKeyDown);
});
// #endregion
</script>

<template>
    <div :class="[$style.BricksBuilder, 'bricks-text']">
        <TheBuilderShellToolbar
            :inert="isBuilderLocked"
            :is-editing-existing-page="isEditingExistingPage"
            :is-submitting-publish="publishStore.isSubmitting"
            :has-selected-component="hasSelectedComponent"
            :is-publish-settings-complete="isPublishSettingsComplete"
            :is-session-ready="isSessionReady"
            :sidebar-offset="leftSidebarOffset"
            :page-title="currentPublishPageTitle"
            :pages="publishStore.publishedPages"
            :current-page-id="sessionPageId"
            :is-pages-loaded="publishStore.pagesLoadedAt !== null"
            :is-pages-loading="isPagesRefreshing"
            :is-submitting-page="publishStore.isSubmitting"
            @open-pages-manager="handleOpenPagesManager"
            @open-page-selector="handleOpenPageSelector"
            @select-page="handleSelectPage"
            @create-page="handleOpenCreatePage"
            @open-media-gallery="handleOpenMediaGalleryWithContext"
            @save-draft="handleSaveDraftGuarded"
            @save-as-copy="handleSaveAsCopyGuarded"
            @save-as-template="templateSave.requestFromCanvas"
            @preview="handlePreview"
            @open-profile="profileModal.open"
            @logout="handleLogout"
        />

        <div :class="$style.content">
            <div :class="$style.workspace" :inert="isBuilderLocked">
                <BuilderShellToolbarVerticalNav
                    :is-library-active="isLibraryActive"
                    :is-schema-active="isSchemaActive"
                    :is-publish-settings-active="isPublishSettingsActive"
                    :is-publish-settings-complete="isPublishSettingsComplete"
                    :is-dark-mode="isDarkMode"
                    @toggle-library="handleToggleLibrary"
                    @toggle-schema="handleToggleSchema"
                    @open-publish-settings="handleOpenPublishSettings"
                    @open-docs="handleOpenDocs"
                    @toggle-dark-mode="handleToggleDarkMode"
                    @toggle-locale="handleToggleLocale"
                />

                <TheBuilderShellSidebar
                    ref="sidebarRef"
                    :components="componentLibraryList"
                    :skipped-bricks="skippedBricks"
                    :is-library-load-failed="isComponentLibraryLoadFailed"
                    :is-library-loading="isComponentLibraryLoading"
                    @open-media-gallery="handleOpenMediaGalleryWithContext"
                    @retry-library="handleRetryComponentLibrary"
                />

                <TheBuilderShellSidebarPropertiesPanel
                    v-if="canEdit"
                    ref="propertiesPanelRef"
                    @open-media-gallery="handleOpenMediaGalleryWithContext('properties')"
                />

                <div :class="$style.canvasWrapper">
                    <TheBuilderLoader :is-loading="isSessionLoading" @hidden="handleLoaderHidden" />
                    <TheBuilderCanvas />
                </div>
            </div>

            <TheBuilderSessionError
                v-if="sessionError"
                :message="sessionError"
                :is-retrying="isSessionLoading"
                @retry="handleRetrySession"
                @open-pages-manager="handleOpenPagesManager"
            />
        </div>

        <div v-if="isBuilderLocked" :class="$style.sessionBlocker" aria-hidden="true"></div>

        <TheBuilderAuthProfileModal
            v-if="profileModal.shouldMount.value"
            :is-open="profileModal.isOpen.value"
            :can-change-password="canChangePassword"
            @close="profileModal.close"
            @notify="showToast"
        />

        <TheBuilderDocumentationModal
            :is-open="isDocumentationModalOpen"
            @close="handleCloseDocs"
        />

        <TheBuilderMediaGalleryModal
            v-if="shouldMountMediaGallery"
            :visible="isMediaGalleryModalOpen"
            :context="mediaGalleryContext"
            @close="handleCloseMediaGallery"
            @error="handleMediaError"
            @select="handleMediaSelect"
        />

        <TheBuilderPublishCreatePageModal
            v-if="shouldMountCreatePageModal"
            :is-open="isCreatePageModalOpen"
            :resolve-imported-schema="schemaImport.resolveSchemaForCreate"
            @close="handleCloseCreatePage"
            @created="handlePageCreated"
        />

        <TheBuilderTemplatesSaveModal
            v-if="templateSave.shouldMountModal.value"
            :is-open="templateSave.isModalOpen.value"
            :source="templateSave.source.value"
            @close="templateSave.close"
            @saved="templateSave.handleSaved"
        />

        <TheBuilderMediaImageResolverModal
            v-if="schemaImport.shouldMountResolver.value"
            :is-open="schemaImport.isResolverModalOpen.value"
            :state="schemaImport.resolverState"
            @confirm="schemaImport.handleResolverConfirm"
            @cancel="schemaImport.handleResolverCancel"
            @skip="schemaImport.handleResolverSkip"
            @set-image-action="schemaImport.handleSetImageAction"
            @set-global-action="schemaImport.handleSetGlobalAction"
        />

        <TheBuilderDraftRestoreModal
            :is-open="isRestoreDraftModalOpen"
            :updated-at="pendingDraft?.updatedAt"
            @close="handleDeferDraft"
            @restore="handleRestoreDraft"
            @discard="handleDiscardDraft"
        />

        <BricksToast
            v-model:visible="toast.visible"
            :message="toast.message"
            :variant="toast.variant"
            :duration="toastDuration"
            :auto-hide="toast.autoHide"
            :action-label="toast.actionLabel"
            @action="toast.onAction?.()"
            @select="toast.onSelect?.()"
        />
    </div>
</template>

<style module lang="scss">
.BricksBuilder {
    overflow: hidden;
    display: flex;
    width: 100vw;
    height: 100vh;
    background-color: var(--bricks-workspace-bg);
    flex-direction: column;
}

.content {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
}

.workspace {
    display: flex;
    flex: 1;
    min-width: 0;
}

.canvasWrapper {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
}

.sessionBlocker {
    position: fixed;
    z-index: var(--bricks-z-blocking);
    background: transparent;
    cursor: progress;
    inset: 0;
}
</style>
