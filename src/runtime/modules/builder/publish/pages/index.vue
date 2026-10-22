<script setup lang="ts">
/**
 * @description The dashboard host: it assembles the shell, the sections and every
 * modal of the dashboard, owns the selected page and shows the toasts.
 *
 * Decisions held by the markup: the templates, the accounts and the media library
 * each arrive as a controller component of their own — assembled here, every one of
 * them would add another state machine into this file next to the pages, while the
 * host stays the one that shows the toasts, opens the page creation form and the
 * lightbox. The confirmations of a media deletion and of a schema replacement live
 * here for the mirror reason: both are requested out of a slot of the shell whose
 * state this host owns, and neither closes on its own. The template save form is one
 * per dashboard — an action of a page row opens it.
 */

// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IMediaCategory, IMediaItem } from '../../../common/types/media';
import type { TPublishDashboardSection } from '../types/dashboard';
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { TMediaLightboxItem } from '../../media/types/media';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
import {
    getBuilderPageRouteLocation,
    toPageAddress,
} from '../../../common/utils/bricks/pageAddress';

// Vue
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useRouter, useHead } from '#imports';

// Pinia
import { useMediaCategoriesStore } from '../../media/stores/mediaCategories';
import { usePublishStore } from '../stores/publish';

// Composables
import { useAuthProfile } from '../../auth/composables/useAuthProfile';
import { useAuthProfileModal } from '../../auth/composables/useAuthProfileModal';
import { useAuthSession } from '../../auth/composables/useAuthSession';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePublishDashboard } from '../composables/usePublishDashboard';
import { useBuilderPreferences } from '../../core/composables/useBuilderPreferences';
import { usePublishDashboardSections } from '../composables/usePublishDashboardSections';
import { usePublishMediaGallery } from '../composables/usePublishMediaGallery';
import { usePublishMediaSurface } from '../composables/usePublishMediaSurface';
import { usePublishPageActions } from '../composables/usePublishPageActions';
import { usePublishPageDelete } from '../composables/usePublishPageDelete';
import { usePublishPagesData } from '../composables/usePublishPagesData';
import { usePublishVersionRestore } from '../composables/usePublishVersionRestore';
import { usePublishSchemaImport } from '../composables/usePublishSchemaImport';
import { usePublishTemplatesSurface } from '../composables/usePublishTemplatesSurface';
import { useTemplatesData } from '../../templates/composables/useTemplatesData';
import { useUsersData } from '../../users/composables/useUsersData';

// Components
import TheBuilderPublishDashboard from '../components/TheBuilderPublishDashboard.vue';
import BuilderPublishPagesList from '../components/BuilderPublishPagesList.vue';
import BuilderPublishDetailsPanel from '../components/BuilderPublishDetailsPanel.vue';
import TheBuilderPublishCreatePageModal from '../components/TheBuilderPublishCreatePageModal.vue';
import BuilderMediaGalleryPreviewLightbox from '../../media/components/BuilderMediaGalleryPreviewLightbox.vue';
import BuilderMediaGalleryUploadControls from '../../media/components/BuilderMediaGalleryUploadControls.vue';
import BuilderMediaSectionDetailsPanel from '../../media/components/BuilderMediaSectionDetailsPanel.vue';
import TheBuilderMediaSection from '../../media/components/TheBuilderMediaSection.vue';
import TheBuilderUsersSection from '../../users/components/TheBuilderUsersSection.vue';
import TheBuilderTemplatesSection from '../../templates/components/TheBuilderTemplatesSection.vue';
import TheBuilderTemplatesSaveModal from '../../templates/components/TheBuilderTemplatesSaveModal.vue';
import BuilderAuthDefaultPasswordNotice from '../../auth/components/BuilderAuthDefaultPasswordNotice.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';

// The modals are lazy chunks: they are not needed before an opening (the
// documentation pulls markdown-it and the articles along)
const TheBuilderDocumentationModal = defineAsyncComponent(
    () => import('../../documentation/components/TheBuilderDocumentationModal.vue')
);
const TheBuilderMediaGalleryModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaGalleryModal.vue')
);
// The profile is opened from the menu in the corner — before that the modal is
// needed neither by the markup nor as a chunk (it holds the password form, the
// cropping and vee-validate)
const TheBuilderAuthProfileModal = defineAsyncComponent(
    () => import('../../auth/components/TheBuilderAuthProfileModal.vue')
);
// The image resolver is needed by the schema import alone — it is kept in a chunk of
// its own. The mounting condition in the template is mandatory: without it the chunk
// would travel out by the first render of the dashboard, and the import would be lazy
// on paper only
const TheBuilderMediaImageResolverModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaImageResolverModal.vue')
);
// #endregion

// #region Data
const { t } = useI18n();
const router = useRouter();
const publishStore = usePublishStore();
// The row of categories is read by the section and shown by the details panel as
// well — there is one source, the store
const mediaCategoriesStore = useMediaCategoriesStore();
const { toast, toastDuration, showToast } = useBuilderToast();
const { logout } = useAuthSession();
// The composable is created here, synchronously: `useState`/`useRequestEvent` live
// inside it, and those are obliged to be called before the first `await` of this
// setup — the profile itself is sent for below, together with the role
const { profile, ensureProfile } = useAuthProfile();
// The profile modal is opened by the menu in the corner of the header
const profileModal = useAuthProfileModal();
const { canChangePassword, canManageUsers, ensureRole } = useBuilderPermissions();
const { searchQuery, activeFilter, filterCounts, filteredPages, hasAnyPages } = usePublishDashboard(
    computed(() => publishStore.publishedPages)
);
const {
    duplicatingPageIds,
    togglingPageIds,
    thumbnailPreviewItem,
    togglePublished,
    duplicatePage,
    previewPage,
    previewThumbnail,
    closeThumbnailPreview,
} = usePublishPageActions({ onNotify: showToast });
const { isDarkMode, bodyClass, toggleDarkMode, toggleLocale } = useBuilderPreferences();
const mediaGallery = usePublishMediaGallery();
// The media library surface: the upload lives in the header of the dashboard while
// the selected file lives in the details panel, that is, on either side of the
// section itself. The shared state is held by the host — exactly as the selected page
// is
const media = usePublishMediaSurface({ onNotify: showToast });
const uploadControlsRef = ref<InstanceType<typeof BuilderMediaGalleryUploadControls> | null>(null);
// The dashboard needs the account list before the section is opened too: the rail
// item shows a counter. The section reads that same state — there is one of it per
// application
const { usersCount, status: usersStatus, ensureUsers } = useUsersData();
// The same with the templates: the rail counter is drawn before the section is
// opened, and the list is one per application — it is read both by the section and by
// the source picker of a new page
const { templatesCount, ensureTemplates } = useTemplatesData();
// The templates surface: preparing a source out of a row of the list (the schema of
// the page has to be read by a point lookup), the pre-pick of a template for the
// creation form and the snapshot for the lightbox
const templates = usePublishTemplatesSurface({ onNotify: showToast });
const isCreatePageModalOpen = ref(false);
const isCreateUserModalOpen = ref(false);
const isDocumentationModalOpen = ref(false);

const {
    isRestoreConfirmationOpen,
    isRestoring,
    restoreConfirmationDescription,
    requestRestoreVersion,
    closeRestoreConfirmation,
    confirmRestoreVersion,
} = usePublishVersionRestore({ onNotify: showToast });
const selectedPageId = ref<string | null>(null);
const detailsPanelRef = ref<InstanceType<typeof BuilderPublishDetailsPanel> | null>(null);

const {
    isDeleteConfirmationOpen,
    isDeleting,
    deleteConfirmationDescription,
    requestDeletePage,
    closeDeleteConfirmation,
    confirmDeletePage,
} = usePublishPageDelete({
    onNotify: showToast,
    onDeleted: (pageId) => {
        if (selectedPageId.value === pageId) {
            selectedPageId.value = null;
        }
    },
});

// The schema import lives here rather than in the details panel because it serves
// the creation modal too, and because its modals outlive both a change of the
// selected page and the closing of the panel. It is not destructured by name: only
// the template uses its fields, and a scatter of seventeen variables reads worse
const schemaImport = usePublishSchemaImport({
    onNotify: showToast,
    isTargetSelected: (pageId) => selectedPageId.value === String(pageId),
});

// #endregion

// #region Computed
const pagesCount = computed<number>(() => publishStore.publishedPages.length);
const mediaCategories = computed<IMediaCategory[]>(() => mediaCategoriesStore.categories);

/**
 * The selected page comes from the store, so that the panel sees the result of a
 * patch or a deletion.
 */
const selectedPage = computed<TPublishedPageSummary | null>(() => {
    if (selectedPageId.value === null) {
        return null;
    }
    return publishStore.getPageById(selectedPageId.value) ?? null;
});

/**
 * The "Users" section is shown when the rights are there AND the endpoints answer:
 * `unavailable` is set on a 403 and on a 404 of the first load, that is, on "there is
 * no such section in this installation". Leaving the item in that state would mean
 * leading a person onto an empty screen that nothing is going to fill.
 */
const isUsersSectionVisible = computed<boolean>(
    () => canManageUsers.value && usersStatus.value !== 'unavailable'
);

/**
 * The open section and the search string of that section: every list has a query of
 * its own while the field in the header is single. Down here among the Computed
 * rather than in Data: the composable puts the open accounts section out when it
 * disappears — that is, it reads the availability of the section, which adds up right
 * above it.
 */
const {
    activeSection,
    usersSearchQuery,
    templatesSearchQuery,
    mediaSearchQuery,
    activeSearchQuery,
    selectSection,
    setSearchQuery,
} = usePublishDashboardSections({
    pagesSearchQuery: searchQuery,
    isUsersSectionVisible,
    onLeaveMedia: media.resetSurface,
    onEnterMedia: media.ensureMedia,
});

/** One's own account: its row in the list is marked and loses some of the actions */
const currentUserId = computed<number | null>(() => profile.value?.id ?? null);

/**
 * What the lightbox shows: a page snapshot, a template snapshot or a media file. One
 * component for every section — exactly one of them is open at a time, and a second
 * instance would add another copy of the dialog, focus trap and all, into the markup.
 */
const lightboxItem = computed<TMediaLightboxItem | null>(
    () => media.previewItem.value ?? templates.previewItem.value ?? thumbnailPreviewItem.value
);

// #endregion

// #region Methods
/**
 * Opens the page creation modal (the header button and the CTA of the empty list).
 */
function handleCreatePage(): void {
    templates.clearCreateSelection();
    isCreatePageModalOpen.value = true;
}

/**
 * Opens the page creation form with a picked source template. The form is the same
 * one the header button opens: a page made out of a template has the same address,
 * the same SEO fields and the same occupancy check — a separate form would repeat all
 * of that for the sake of one pre-picked source.
 *
 * @param template - The source template.
 */
function handleCreatePageFromTemplate(template: TBricksTemplateSummary): void {
    templates.selectForCreate(template);
    isCreatePageModalOpen.value = true;
}

/**
 * Closes the lightbox: every source of a snapshot is put out — which of them was open
 * the component does not know, and an extra reset costs nothing.
 */
function handleCloseLightbox(): void {
    media.closePreview();
    templates.closePreview();
    closeThumbnailPreview();
}

/**
 * The template was saved: the form closes and a message goes out.
 *
 * @param template - The saved template.
 */
function handleTemplateSaved(template: TBricksTemplateSummary): void {
    templates.close();
    showToast(t('bricks.templates.toasts.saved', { name: template.name }), 'success');
}

/**
 * Closes the page creation modal.
 */
function handleCloseCreatePageModal(): void {
    isCreatePageModalOpen.value = false;
}

/**
 * Moves into the builder editor after a page has been created.
 *
 * @param address - The address of the created page.
 */
async function handlePageCreated(address: IBricksPageAddress): Promise<void> {
    isCreatePageModalOpen.value = false;
    await router.push(getBuilderPageRouteLocation(address));
}

/**
 * Opens the account creation form (the header button and the CTA of the empty list).
 */
function handleCreateUser(): void {
    isCreateUserModalOpen.value = true;
}

/**
 * Closes the account creation form.
 */
function handleCloseCreateUserModal(): void {
    isCreateUserModalOpen.value = false;
}

/**
 * Opens one's own profile on the password tab — the key in one's own row of the
 * accounts section. The admin endpoint for somebody else's password refuses one's own
 * account deliberately: one's own password is changed only by typing the current one.
 */
function handleChangeOwnPassword(): void {
    profileModal.open('password');
}

/**
 * Selects a page — opens the details panel.
 *
 * @param page - The page.
 */
function handleSelectPage(page: TPublishedPageSummary): void {
    selectedPageId.value = String(page.id);
}

/**
 * Closes the details panel.
 */
function handleCloseDetails(): void {
    selectedPageId.value = null;
}

// A change of the selected page (its closing and its deletion included) puts a
// started import out: its confirmation and its resolver lie in the body, outside the
// details panel, so they do not close on their own — while a confirmation given for
// the previous page concerned that page's content
watch(selectedPageId, () => {
    schemaImport.cancelImport();
});

/**
 * Opens the page in the builder editor.
 *
 * @param page - The page.
 */
async function handleEditPage(page: TPublishedPageSummary): Promise<void> {
    await router.push(getBuilderPageRouteLocation(toPageAddress(page.pagename, page.urlPrefix)));
}

/**
 * Shows a toast raised by the details panel (a save, a URL copied).
 *
 * @param message - The text of the notification.
 * @param variant - The kind of the notification.
 */
function handleDetailsNotify(message: string, variant: 'success' | 'error'): void {
    showToast(message, variant);
}

/**
 * Signs out of the database-auth session; shows a toast on an error.
 */
async function handleLogout(): Promise<void> {
    try {
        await logout();
    } catch {
        showToast(t('bricks.auth.logoutFailed'), 'error');
    }
}

/**
 * Opens the documentation modal.
 */
function handleOpenDocs(): void {
    isDocumentationModalOpen.value = true;
}

/**
 * Closes the documentation modal.
 */
function handleCloseDocs(): void {
    isDocumentationModalOpen.value = false;
}

/**
 * Passes the image picked in the gallery into the form of the details panel. There is
 * no context left to check: the modal on the dashboard is left as the OG image picker
 * alone — the file manager is the rail section, and it returns nothing anywhere.
 *
 * @param item - The picked media object.
 */
function handleMediaSelect(item: IMediaItem): void {
    detailsPanelRef.value?.handleMediaSelect(item);
    mediaGallery.close();
}

/**
 * Shows a toast about an error of the media gallery.
 *
 * @param message - The text of the error.
 */
function handleMediaError(message: string): void {
    showToast(message, 'error');
}

/**
 * Opens the system file picker from the drop tile: the input itself lives in the
 * controls of the header, and a second one of the same kind in the grid would mean
 * two points of truth about which file types are accepted.
 */
function handleMediaUploadRequest(): void {
    uploadControlsRef.value?.openFilePicker();
}

/**
 * Opens the selected file full screen (an action of the details panel).
 */
function handleMediaPreviewSelected(): void {
    const item = media.selectedItem.value;

    if (!item) {
        return;
    }

    media.openPreview(item);
}

/**
 * An empty result in the media library: the category and the search string are
 * dropped at once — their owners are different (the surface and the header).
 */
function handleResetMediaFilters(): void {
    media.categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
    mediaSearchQuery.value = '';
}
// #endregion

// #region Lifecycle
useHead({
    title: computed(() => t('bricks.publish.dashboard.title')),
    bodyAttrs: {
        class: bodyClass,
    },
});

// The loading of the data comes as the last statements of the setup: an `await`
// makes the component asynchronous, so everything that depends on the Nuxt context
// (`useCookie`, `useHead`) is declared above.
//
// The page list STARTS here while it is awaited below: it depends on neither the
// profile nor the role, and awaiting them in sequence would add the delays of three
// requests up into one delay of the HTML
const pagesDataPromise = usePublishPagesData({
    onLoadFailed: () => showToast(t('bricks.publish.dashboard.toasts.loadFailed'), 'error'),
});

// The profile and the role of the session come before the first frame: the page list
// draws its actions by the rights, and showing them "until we find out" would mean
// taking the buttons away from a viewer after they had already seen them; and there
// is nothing to draw the avatar in the corner with without a profile. On SSR both
// arrive from the request context, and the `me` endpoint is needed by the builds
// without SSR alone — where it goes out ONCE for both states: `ensureRole` takes the
// role out of the profile already received rather than requesting it a second time
await ensureProfile();
await ensureRole(() => Promise.resolve(profile.value?.role ?? null));

// The accounts are read AFTER the role: before `ensureRole` a build without SSR
// takes the role for the narrowest one, and the request would go out on behalf of a
// viewer for a refusal known in advance. The right to the section is checked by
// `ensureUsers` itself — the guard lives next to the request rather than here. The
// templates and the files go in the same group: every counter of the rail is drawn
// in the first frame, and a refused load stays a state of its own section instead of
// carrying the dashboard away. Neither of those two waits for the role (any role may
// read them), and neither starts a queue of its own
const [{ isLoadingPages, isRefreshingPages, refreshPages }] = await Promise.all([
    pagesDataPromise,
    ensureUsers(),
    ensureTemplates(),
    media.ensureMedia(),
]);
// #endregion
</script>

<template>
    <div :class="[$style.BuilderIndex, 'bricks-text']">
        <TheBuilderPublishDashboard
            :active-section="activeSection"
            :search-query="activeSearchQuery"
            :pages-count="pagesCount"
            :templates-count="templatesCount"
            :users-count="usersCount"
            :media-count="media.mediaCount.value"
            :is-users-section-visible="isUsersSectionVisible"
            :is-dark-mode="isDarkMode"
            @update:search-query="setSearchQuery"
            @select-section="selectSection"
            @create-page="handleCreatePage"
            @create-user="handleCreateUser"
            @open-docs="handleOpenDocs"
            @toggle-dark-mode="toggleDarkMode"
            @toggle-locale="toggleLocale"
            @open-profile="profileModal.open()"
            @logout="handleLogout"
        >
            <template #headerAction>
                <BuilderMediaGalleryUploadControls
                    ref="uploadControlsRef"
                    :max-image-size-mb="media.maxImageSizeMb"
                    :max-video-size-mb="media.maxVideoSizeMb"
                    :optimization="media.uploadOptimization.value"
                    :configured-max-width="media.defaultOptimization.maxWidth"
                    :upload-progress="media.uploadProgress.value"
                    :show-options="false"
                    :drop-hint="t('bricks.media.dropSectionHint')"
                    @upload="media.uploadFiles"
                />
            </template>

            <template #notice>
                <BuilderAuthDefaultPasswordNotice
                    :can-change-password="canChangePassword"
                    @change-password="handleChangeOwnPassword"
                />
            </template>

            <template #list>
                <BuilderPublishPagesList
                    :pages="filteredPages"
                    :active-filter="activeFilter"
                    :counts="filterCounts"
                    :is-loading="isLoadingPages"
                    :is-refreshing="isRefreshingPages"
                    :has-any-pages="hasAnyPages"
                    :duplicating-page-ids="duplicatingPageIds"
                    :template-source-page-id="templates.preparingPageId.value"
                    :selected-page-id="selectedPageId"
                    @update:active-filter="activeFilter = $event"
                    @create-page="handleCreatePage"
                    @refresh="refreshPages"
                    @select="handleSelectPage"
                    @preview-thumbnail="previewThumbnail"
                    @edit="handleEditPage"
                    @preview="previewPage"
                    @duplicate="duplicatePage"
                    @save-as-template="templates.requestFromPage"
                    @delete="requestDeletePage"
                />
            </template>

            <template #templates>
                <TheBuilderTemplatesSection
                    :search-query="templatesSearchQuery"
                    @notify="showToast"
                    @go-to-pages="selectSection('pages')"
                    @create-page="handleCreatePageFromTemplate"
                    @preview-thumbnail="templates.previewThumbnail"
                />
            </template>

            <template v-if="isUsersSectionVisible" #users>
                <TheBuilderUsersSection
                    :search-query="usersSearchQuery"
                    :is-create-modal-open="isCreateUserModalOpen"
                    :current-user-id="currentUserId"
                    @notify="showToast"
                    @close-create-modal="handleCloseCreateUserModal"
                    @create-user="handleCreateUser"
                    @change-own-password="handleChangeOwnPassword"
                />
            </template>

            <template #media>
                <TheBuilderMediaSection
                    :search-query="mediaSearchQuery"
                    :category-filter="media.categoryFilter.value"
                    :selected-item-id="media.selectedItemId.value"
                    :max-image-size-mb="media.maxImageSizeMb"
                    :max-video-size-mb="media.maxVideoSizeMb"
                    :upload-optimization="media.uploadOptimization.value"
                    :configured-max-width="media.defaultOptimization.maxWidth"
                    @update:category-filter="media.categoryFilter.value = $event"
                    @update:upload-optimization="media.setOptimization"
                    @select="media.selectItem"
                    @preview="media.openPreview"
                    @upload="media.uploadFiles"
                    @request-upload="handleMediaUploadRequest"
                    @reset-filters="handleResetMediaFilters"
                    @notify="showToast"
                />
            </template>

            <template v-if="media.selectedItem.value" #mediaDetails>
                <BuilderMediaSectionDetailsPanel
                    :item="media.selectedItem.value"
                    :categories="mediaCategories"
                    @close="media.closeDetails"
                    @update-meta="media.updateMeta"
                    @update-category="media.updateCategory"
                    @remove="media.requestDelete"
                    @preview="handleMediaPreviewSelected"
                    @notify="showToast"
                />
            </template>

            <template v-if="selectedPage" #details>
                <BuilderPublishDetailsPanel
                    ref="detailsPanelRef"
                    :page="selectedPage"
                    :is-duplicating="duplicatingPageIds.has(String(selectedPage.id))"
                    :is-toggling-published="togglingPageIds.has(String(selectedPage.id))"
                    :is-importing="schemaImport.isImporting.value"
                    @close="handleCloseDetails"
                    @edit="handleEditPage"
                    @duplicate="duplicatePage"
                    @delete="requestDeletePage"
                    @toggle-published="togglePublished"
                    @open-media="mediaGallery.open"
                    @restore-version="requestRestoreVersion"
                    @import-schema-file="schemaImport.requestPageImport"
                    @notify="handleDetailsNotify"
                />
            </template>
        </TheBuilderPublishDashboard>

        <TheBuilderPublishCreatePageModal
            :is-open="isCreatePageModalOpen"
            :initial-template="templates.createTemplate.value"
            :resolve-imported-schema="schemaImport.resolveSchemaForCreate"
            @close="handleCloseCreatePageModal"
            @created="handlePageCreated"
        />

        <TheBuilderTemplatesSaveModal
            :is-open="templates.isModalOpen.value"
            :source="templates.source.value"
            @close="templates.close"
            @saved="handleTemplateSaved"
        />

        <TheBuilderAuthProfileModal
            v-if="profileModal.shouldMount.value"
            :is-open="profileModal.isOpen.value"
            :can-change-password="canChangePassword"
            :initial-tab="profileModal.requestedTab.value"
            @close="profileModal.close"
            @notify="showToast"
        />

        <TheBuilderDocumentationModal
            :is-open="isDocumentationModalOpen"
            @close="handleCloseDocs"
        />

        <TheBuilderMediaGalleryModal
            v-if="mediaGallery.shouldMount.value"
            :visible="mediaGallery.isOpen.value"
            context="properties"
            @close="mediaGallery.close"
            @select="handleMediaSelect"
            @error="handleMediaError"
        />

        <BricksConfirmModal
            :is-open="isDeleteConfirmationOpen"
            :title="t('bricks.publish.dashboard.deleteConfirm.title')"
            :description="deleteConfirmationDescription"
            :confirm-text="t('bricks.common.delete')"
            confirm-variant="danger"
            :is-loading="isDeleting"
            @close="closeDeleteConfirmation()"
            @confirm="confirmDeletePage"
        />

        <BricksConfirmModal
            :is-open="media.isDeleteConfirmOpen.value"
            :title="t('bricks.media.deleteImageTitle')"
            :description="t('bricks.media.deleteImageDescription')"
            :confirm-text="t('bricks.common.delete')"
            confirm-variant="danger"
            :is-loading="media.isDeleting.value"
            @close="media.closeDeleteConfirm"
            @confirm="media.confirmDelete"
        />

        <BricksConfirmModal
            :is-open="isRestoreConfirmationOpen"
            :title="t('bricks.publish.dashboard.details.versions.restoreConfirm.title')"
            :description="restoreConfirmationDescription"
            :confirm-text="t('bricks.publish.dashboard.details.versions.restore')"
            confirm-variant="primary"
            :is-loading="isRestoring"
            @close="closeRestoreConfirmation()"
            @confirm="confirmRestoreVersion"
        />

        <BricksConfirmModal
            :is-open="schemaImport.isReplaceConfirmationOpen.value"
            :title="t('bricks.publish.dashboard.details.schema.replaceConfirm.title')"
            :description="schemaImport.replaceConfirmationDescription.value"
            :confirm-text="t('bricks.publish.dashboard.details.schema.replaceConfirm.confirm')"
            confirm-variant="primary"
            @close="schemaImport.closeReplaceConfirmation"
            @confirm="schemaImport.confirmReplace"
            @after-leave="schemaImport.handleConfirmationAfterLeave"
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

        <BuilderMediaGalleryPreviewLightbox :item="lightboxItem" @close="handleCloseLightbox" />

        <BricksToast
            v-model:visible="toast.visible"
            :message="toast.message"
            :variant="toast.variant"
            :duration="toastDuration"
        />
    </div>
</template>

<style module lang="scss">
.BuilderIndex {
    min-height: 100vh;
    background-color: var(--bricks-base-50);
}
</style>
