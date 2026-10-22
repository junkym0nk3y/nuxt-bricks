<script setup lang="ts">
// #region Imports
// Types
// Vue
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, onScopeDispose } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { definePageMeta, useRouter } from '#imports';

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
import { useBuilderSessionFeedback } from '../composables/useBuilderSessionFeedback';
import { useBuilderSessionToken } from '../composables/useBuilderSessionToken';
import { useBuilderPageChrome } from '../composables/useBuilderPageChrome';
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
import { withSessionReadyGuard } from '../utils/sessionGuards';
import { resolveBuilderDraftPrincipal } from '../../publish/utils/draftStorage';
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
const { t } = useI18n();
const router = useRouter();

const componentsStore = useComponentsStore();
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();

// The toast is a module singleton (useBuilderToast): useBuilderSession needs it
// before useBuilderPage does, and useBuilderPage needs switchToSavedPage in turn
const { toastDuration, showToast } = useBuilderToast();

// The rights and the profile of the session. One request covers both states: the
// role of `ensureRole` is taken out of the profile already received (why there is a
// request at all — in useBuilderPermissions)
const { canEdit, canChangePassword, ensureRole } = useBuilderPermissions();
const { isDatabaseMode, logout } = useAuthSession();
const { profile, ensureProfile } = useAuthProfile();
const profileModal = useAuthProfileModal();

await ensureProfile();
await ensureRole(() => Promise.resolve(profile.value?.role ?? null));

// The owner of the drafts, one value for all three consumers of them: written under
// one principal and removed under another, a draft would come back on the next visit
const draftPrincipal = resolveBuilderDraftPrincipal(isDatabaseMode, profile.value?.id);

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
    draftPrincipal,
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
    draftPrincipal,
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
    isSessionReady,
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

// The loader, the barriers over the interface and the offer to restore a draft: one
// rule holds them together — the offer may be raised only once the loader has left
const { isBuilderLocked, isWorkspaceLocked, handleLoaderHidden } = useBuilderSessionFeedback({
    isSessionLoading,
    isSessionReady,
    sessionError,
    isDraftRestorePending,
    isRestoreDraftModalOpen,
    handleRestoreDraft,
    openRestoreDraftModal,
});

// The dress of the page: the theme, the language, the head of the document and the
// way out. The theme and the language are shared with the dashboard — one cookie
const { isDarkMode, toggleDarkMode, toggleLocale, handleLogout } = useBuilderPageChrome({
    logout,
});

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
    draftPrincipal,
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
// #endregion

// #region Lifecycle
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
            :is-submitting-publish="publishStore.isSubmitting"
            :is-session-ready="isSessionReady"
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
            @open-media-gallery="handleOpenMediaGallery"
            @save-draft="handleSaveDraft"
            @save-as-copy="handleSaveAsCopy"
            @save-as-template="templateSave.requestFromCanvas"
            @preview="handlePreview"
            @open-profile="profileModal.open"
            @logout="handleLogout"
        />

        <div :class="$style.content">
            <div :class="$style.workspace" :inert="isWorkspaceLocked">
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
                    @toggle-dark-mode="toggleDarkMode"
                    @toggle-locale="toggleLocale"
                />

                <TheBuilderShellSidebar
                    ref="sidebarRef"
                    :components="componentLibraryList"
                    :skipped-bricks="skippedBricks"
                    :is-library-load-failed="isComponentLibraryLoadFailed"
                    :is-library-loading="isComponentLibraryLoading"
                    @open-media-gallery="handleOpenMediaGallery"
                    @retry-library="handleRetryComponentLibrary"
                />

                <TheBuilderShellSidebarPropertiesPanel
                    v-if="canEdit"
                    ref="propertiesPanelRef"
                    @open-media-gallery="handleOpenMediaGallery('properties')"
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
                @retry="retryBuilderSession"
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
