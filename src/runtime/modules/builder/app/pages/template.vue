<script setup lang="ts">
/**
 * @description The editor of a template — the composition root of the route
 * `<builderPrefix>/bricks-template/:templateId`.
 *
 * The same canvas, library, properties panel and media gallery as the editor of a page
 * (`useBuilderWorkspace`), with none of the page's own parts: no address, no drafts, no
 * page selector, no publication and no preview. The toolbar carries one action, "Save
 * template", which writes the canvas over the template; the settings panel keeps the
 * styling alone.
 *
 * The default page key of Nuxt is kept (unlike `[pagename].vue`): a move to another
 * template remounts the page, and the session opens anew from `onMounted` — there is no
 * rename of a template session to survive.
 */

// #region Imports
// Vue
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { definePageMeta, useHead, useRoute, useRouter } from '#imports';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useSidebarStore } from '../../core/stores/sidebar';
import { useInlineEditingStore } from '../../../text-editor/stores/inlineEditing';

// Composables
import { useBuilderWorkspace } from '../composables/useBuilderWorkspace';
import { useBuilderComponentLibrary } from '../composables/useBuilderComponentLibrary';
import { useBuilderSessionToken } from '../composables/useBuilderSessionToken';
import { useBuilderSessionFeedback } from '../composables/useBuilderSessionFeedback';
import { useBuilderPageChrome } from '../composables/useBuilderPageChrome';
import { useBuilderTemplateSession } from '../composables/useBuilderTemplateSession';
import { useBuilderTemplateWrite } from '../composables/useBuilderTemplateWrite';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePropertiesPanelAvailability } from '../../core/composables/usePropertiesPanelAvailability';
import { useAuthProfile } from '../../auth/composables/useAuthProfile';
import { useAuthProfileModal } from '../../auth/composables/useAuthProfileModal';
import { useAuthSession } from '../../auth/composables/useAuthSession';

// Utils
import { loadFavoritesFromStorage } from '../../core/stores/actions/favorites';
import { withSessionReadyGuard } from '../utils/sessionGuards';
import {
    BRICKS_DASHBOARD_SECTION_QUERY_KEY,
    BRICKS_ROUTE_NAMES,
} from '../../../common/constants/routes';

// Components
import TheBuilderShellToolbar from '../../shell/toolbar/components/TheBuilderShellToolbar.vue';
import BuilderShellToolbarVerticalNav from '../../shell/toolbar/components/BuilderShellToolbarVerticalNav.vue';
import TheBuilderShellSidebar from '../../shell/sidebar/components/TheBuilderShellSidebar.vue';
import TheBuilderShellSidebarPropertiesPanel from '../../shell/sidebar/components/TheBuilderShellSidebarPropertiesPanel.vue';
import TheBuilderCanvas from '../../canvas/viewport/components/TheBuilderCanvas.vue';
import TheBuilderLoader from '../components/TheBuilderLoader.vue';
import TheBuilderSessionError from '../components/TheBuilderSessionError.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';

// The windows are lazy chunks, mounted by a latch the same way as in the editor of a page
const TheBuilderDocumentationModal = defineAsyncComponent(
    () => import('../../documentation/components/TheBuilderDocumentationModal.vue')
);
const TheBuilderMediaGalleryModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaGalleryModal.vue')
);
const TheBuilderAuthProfileModal = defineAsyncComponent(
    () => import('../../auth/components/TheBuilderAuthProfileModal.vue')
);
// #endregion

// #region Meta
definePageMeta({
    layout: 'bricks',
});
// #endregion

// #region Data
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const componentsStore = useComponentsStore();
const sidebarStore = useSidebarStore();

const { canEdit, canChangePassword, ensureRole } = useBuilderPermissions();
const { logout } = useAuthSession();
const { profile, ensureProfile } = useAuthProfile();
const profileModal = useAuthProfileModal();

await ensureProfile();
await ensureRole(() => Promise.resolve(profile.value?.role ?? null));

const { toastDuration } = useBuilderToast();
const sessionToken = useBuilderSessionToken();
const inlineEditingStore = useInlineEditingStore();

const {
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
} = useBuilderWorkspace({
    inlineMediaBridge: {
        isRequestingMedia: computed(() => inlineEditingStore.isRequestingMedia),
        mediaRequestFilter: computed(() => inlineEditingStore.mediaRequestFilter),
        resolveMediaRequest: (item) => inlineEditingStore.resolveMediaRequest(item),
        cancelMediaRequest: () => inlineEditingStore.cancelMediaRequest(),
        cancelInlineEditing: () => inlineEditingStore.stopEditing(),
    },
    sessionToken,
});

// After the synchronous wiring of the workspace, as inside `useBuilderPage`
const {
    componentLibraryList,
    skippedBricks,
    isComponentLibraryLoadFailed,
    isComponentLibraryLoading,
    handleRetryComponentLibrary,
    notifyComponentLibraryFailure,
} = await useBuilderComponentLibrary();

const {
    isSessionLoading,
    isSessionReady,
    sessionError,
    template,
    loadedPageMeta,
    openTemplateSession,
    retryTemplateSession,
} = useBuilderTemplateSession({ sessionToken, showToast });

const { isSaving, handleSaveTemplate } = useBuilderTemplateWrite({
    sessionToken,
    isSessionReady,
    template,
    loadedPageMeta,
    showToast,
});

// A template has no drafts: the offer to restore one never comes, and the feedback is
// handed a constant "no offer"
const { isBuilderLocked, isWorkspaceLocked, handleLoaderHidden } = useBuilderSessionFeedback({
    isSessionLoading,
    isSessionReady,
    sessionError,
    isDraftRestorePending: computed(() => false),
    isRestoreDraftModalOpen: ref(false),
    handleRestoreDraft: () => undefined,
    openRestoreDraftModal: () => undefined,
});

const { isDarkMode, toggleDarkMode, toggleLocale, handleLogout } = useBuilderPageChrome({
    logout,
});

// The hotkeys work in a consistent session only (the rule is in sessionGuards)
const handleGuardedKeyDown = withSessionReadyGuard<KeyboardEvent>(
    () => isSessionReady.value,
    handleKeyDown
);

usePropertiesPanelAvailability(canEdit);
// #endregion

// #region Computed
/** The template the route asks for */
const templateId = computed<number>(() => Number(route.params.templateId));

const templateName = computed<string>(() => template.value?.name ?? '');

const isLibraryActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'components'
);
const isSettingsActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'publish'
);
const isSchemaActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'schema'
);
// #endregion

// #region Methods
/**
 * Leads back to the "Templates" section of the dashboard the template was opened from.
 */
async function handleOpenTemplates(): Promise<void> {
    await router.push({
        name: BRICKS_ROUTE_NAMES.builderIndex,
        query: { [BRICKS_DASHBOARD_SECTION_QUERY_KEY]: 'templates' },
    });
}

/**
 * Toggles the settings panel. Unlike the editor of a page it never starts a new
 * publication on the way: that would reset the form, and with it the layout, the
 * background and the devices of the open template.
 */
function handleToggleSettings(): void {
    sidebarStore.toggleSidebarView('publish');
}
// #endregion

// #region Lifecycle
useHead({
    title: computed(() =>
        templateName.value
            ? `${templateName.value} — ${t('bricks.publish.dashboard.title')}`
            : t('bricks.publish.dashboard.title')
    ),
});

onMounted(() => {
    window.addEventListener('keydown', handleGuardedKeyDown);
    componentsStore.favorites = loadFavoritesFromStorage();
    notifyComponentLibraryFailure();

    openTemplateSession(templateId.value).catch((error: unknown) => {
        console.error('[Builder] Failed to open template session:', error);
    });
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGuardedKeyDown);
    // An answer that arrives after the editor is left must not land on the canvas of
    // whatever opens next
    sessionToken.invalidate();
});
// #endregion
</script>

<template>
    <div :class="[$style.BricksBuilder, 'bricks-text']">
        <TheBuilderShellToolbar
            mode="template"
            :template-name="templateName"
            :inert="isBuilderLocked"
            :is-submitting-publish="isSaving"
            :is-session-ready="isSessionReady"
            @open-media-gallery="handleOpenMediaGallery"
            @save-template="handleSaveTemplate"
            @open-profile="profileModal.open"
            @logout="handleLogout"
        />

        <div :class="$style.content">
            <div :class="$style.workspace" :inert="isWorkspaceLocked">
                <BuilderShellToolbarVerticalNav
                    :is-library-active="isLibraryActive"
                    :is-schema-active="isSchemaActive"
                    :is-publish-settings-active="isSettingsActive"
                    :is-dark-mode="isDarkMode"
                    @toggle-library="handleToggleLibrary"
                    @toggle-schema="handleToggleSchema"
                    @open-publish-settings="handleToggleSettings"
                    @open-docs="handleOpenDocs"
                    @toggle-dark-mode="toggleDarkMode"
                    @toggle-locale="toggleLocale"
                />

                <TheBuilderShellSidebar
                    ref="sidebarRef"
                    is-template
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
                    @open-media-gallery="handleOpenMediaGallery('properties', $event)"
                />

                <div :class="$style.canvasWrapper">
                    <TheBuilderLoader :is-loading="isSessionLoading" @hidden="handleLoaderHidden" />
                    <TheBuilderCanvas />
                </div>
            </div>

            <TheBuilderSessionError
                v-if="sessionError"
                is-template
                :message="sessionError"
                :is-retrying="isSessionLoading"
                @retry="retryTemplateSession"
                @open-pages-manager="handleOpenTemplates"
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
            :pick-filter="mediaGalleryPickFilter"
            @close="handleCloseMediaGallery"
            @error="handleMediaError"
            @select="handleMediaSelect"
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
