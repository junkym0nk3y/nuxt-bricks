<script setup lang="ts">
/**
 * @description The media library as a modal: the header with the search and the upload,
 * the track of categories, the grid, the footer with the meta panel of the selected file,
 * and the full-screen preview over all of it.
 *
 * The modal is where picking a file is a step inside some other work — the sidebar of the
 * builder, the OG image of a page. The manager of the dashboard is a section of its own,
 * `TheBuilderMediaSection`; the two share the composables and the children, not the
 * surface.
 *
 * The summary of the library and the drag hint share one line of the subtitle: the hint
 * has to be visible at all times, the permanent upload zone that used to announce itself
 * being gone. Uploading is a write, so its controls go to a role that has one. The
 * counters and the filtered list are computed the same way `TheBuilderMediaSection`
 * computes them.
 *
 * The content of the grid is swapped with a dissolve: switching a category used to
 * replace the grid instantly, and against a layout that did not move (six tiles before,
 * six after) there was no seeing that the list had been refreshed at all. The key is the
 * category alone, without the search query: on the query the grid would be rebuilt letter
 * by letter and would blink at every keystroke. The drop target covers the grid alone:
 * the row of filters has to stay visible, it being what tells which category the files
 * will go into.
 *
 * Decisions held by the style section: the area of the grid is the positioning container
 * of the drop target, so it stretches over the grid's place rather than over the whole
 * content of the modal; and the band at the bottom is one of metadata rather than one of
 * actions — the properties panel of the selected file lives inside it, which is why
 * `BricksModalFooter`, being about buttons, does not fit. Its height comes from its
 * content: one hint row with nothing selected, two with a file.
 */

// #region Imports

// Types
import type {
    IBricksMediaOptimization,
    IMediaItem,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';
import type { IMediaGalleryProps, IMediaGalleryEmits } from '../types/media';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
import { DEFAULT_MEDIA_OPTIMIZATION } from '../../../common/constants/mediaOptimization';
import { getBricksErrorMessage } from '../../../common/utils/main';
import { resolveMediaCategoryLabelBySlug } from '../utils/categoryLabels';
import { formatFileSize } from '../utils/formatFileSize';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useMediaStore } from '../stores/media';
import { useMediaCategoriesStore } from '../stores/mediaCategories';

// Composables
import { useMediaUpload } from '../composables/useMediaUpload';
import { useMediaCategoryActions } from '../composables/useMediaCategoryActions';
import { useMediaGalleryFileDrop } from '../composables/useMediaGalleryFileDrop';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksSearchInput from '../../../ui/inputs/BricksSearchInput.vue';
import BricksEmptyState from '../../../ui/feedback/BricksEmptyState.vue';
import BuilderMediaGalleryFilters from './BuilderMediaGalleryFilters.vue';
import BuilderMediaGalleryUploadControls from './BuilderMediaGalleryUploadControls.vue';
import BuilderMediaGalleryDropOverlay from './BuilderMediaGalleryDropOverlay.vue';
import BuilderMediaGalleryGrid from './BuilderMediaGalleryGrid.vue';
import BuilderMediaGalleryMetaPanel from './BuilderMediaGalleryMetaPanel.vue';
import BuilderMediaGalleryPreviewLightbox from './BuilderMediaGalleryPreviewLightbox.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryProps>(), {
    context: 'manager',
});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const mediaStore = useMediaStore();
const categoriesStore = useMediaCategoriesStore();
const { canEdit, canDelete } = useBuilderPermissions();
const selectedItemId = ref<number | null>(null);
const categoryFilter = ref<string>(ALL_MEDIA_CATEGORIES_FILTER);
const searchQuery = ref('');
const previewItem = ref<IMediaItem | null>(null);
const isDeleteConfirmOpen = ref(false);
const isDeleting = ref(false);
const toastVisible = ref(false);
const toastMessage = ref('');
const uploadControlsRef = ref<InstanceType<typeof BuilderMediaGalleryUploadControls> | null>(null);

/**
 * The upload parameters live in the modal rather than in the store: they belong to a
 * session of work with the gallery and not to the library itself, and on a new opening
 * they are obliged to go back to the defaults of the config. They start out as the shared
 * defaults and are covered with the config's right after `useMediaUpload` — there is
 * nowhere to take the config from any earlier, and the ref cannot be declared any later:
 * the composable reads it inside a callback.
 */
const uploadOptimization = ref<IBricksMediaOptimization>({ ...DEFAULT_MEDIA_OPTIMIZATION });

const { maxImageSizeMb, maxVideoSizeMb, defaultOptimization, uploadProgress, uploadFiles } =
    useMediaUpload({
        resolveCategory: resolveUploadCategory,
        resolveOptimization: () => uploadOptimization.value,
        onError: showErrorToast,
    });

uploadOptimization.value = { ...defaultOptimization };

const {
    draggedFileCount,
    isDraggingFiles,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    resetFileDrop,
} = useMediaGalleryFileDrop({ onFiles: handleUpload });
// #endregion

// #region Computed
const shouldShowPickerActions = computed<boolean>(() => props.context === 'properties');
const mediaItems = computed(() => mediaStore.items);
const isUploading = computed(() => mediaStore.isUploading);
const hasItems = computed(() => mediaItems.value.length > 0);
/**
 * Whether the contents of the media library have been read: until the first successful
 * answer the "All" counter is not drawn — a zero in its place would claim that there are
 * no files.
 */
const hasLibrarySnapshot = computed<boolean>(() => mediaStore.hasLoadedItemsSnapshot);
const selectedItem = computed(
    () => mediaItems.value.find((item) => item.id === selectedItemId.value) ?? null
);
/**
 * Files with no category fall into no counter: they are seen under "All" only.
 */
const categoryCounts = computed<Record<string, number>>(() =>
    mediaItems.value.reduce<Record<string, number>>((counts, item) => {
        if (item.category) {
            counts[item.category] = (counts[item.category] ?? 0) + 1;
        }

        return counts;
    }, {})
);
const totalSize = computed<number>(() =>
    mediaItems.value.reduce((sum, item) => sum + item.size, 0)
);
/**
 * The summary of the media library in the header: it is about the whole library, so it
 * stands next to the upload button — the one thing that changes it — rather than in the
 * footer, which is taken by the selected file.
 */
const librarySummary = computed<string>(() =>
    t('bricks.media.librarySummaryShort', {
        count: mediaItems.value.length,
        size: formatFileSize(totalSize.value),
    })
);

/**
 * The actions over the categories. Down here among the computeds rather than up in the
 * data: the composable reads `categoryCounts` for the text of the confirmation, and
 * reaching for it above its declaration would break the order even in a deferred closure.
 */
const {
    categories,
    isCreatingCategory,
    categoryPendingDeletion,
    isDeletingCategory,
    deleteCategoryTitle,
    deleteCategoryDescription,
    handleCreateCategory,
    handleRequestCategoryDelete,
    handleCloseCategoryDelete,
    handleConfirmCategoryDelete,
    resetCategoryActions,
} = useMediaCategoryActions({
    resolveCategoryCount: (slug) => categoryCounts.value[slug] ?? 0,
    onCategoryDeleted: handleCategoryDeleted,
    onError: showErrorToast,
});

/**
 * The filtered list of the grid: the category out of the track, then the search string.
 *
 * Below `useMediaCategoryActions`, because the search matches against the CAPTION of a
 * category, and the list of captions comes from there. Matching against `item.category`
 * would not do: what lies there is a slug, so a search by a caption found nothing — the
 * data holds its transliteration.
 */
const filteredMediaItems = computed(() => {
    const filterValue = categoryFilter.value;
    const query = searchQuery.value.trim().toLowerCase();

    return mediaItems.value.filter((item) => {
        const matchesCategory =
            filterValue === ALL_MEDIA_CATEGORIES_FILTER || item.category === filterValue;
        const matchesSearch =
            !query ||
            item.filename.toLowerCase().includes(query) ||
            item.alt.toLowerCase().includes(query) ||
            Boolean(
                item.category &&
                resolveMediaCategoryLabelBySlug(item.category, categories.value)
                    .toLowerCase()
                    .includes(query)
            );
        return matchesCategory && matchesSearch;
    });
});
const hasFilteredItems = computed(() => filteredMediaItems.value.length > 0);
// #endregion

// #region Methods
/**
 * Loads the media and the categories, taking care of the errors.
 *
 * In parallel: the lists are independent, and starting them one after the other would
 * double the delay of opening the gallery.
 */
async function loadGalleryData(): Promise<void> {
    const [itemsResult, categoriesResult] = await Promise.allSettled([
        mediaStore.loadItems(),
        categoriesStore.loadCategories(),
    ]);

    if (itemsResult.status === 'rejected') {
        emit(
            'error',
            getBricksErrorMessage(itemsResult.reason, t('bricks.media.loadFailedCheckDb'))
        );
    }

    // A refusal of the categories does not cancel the gallery: the files are visible
    // without the row of tabs too, so this is a toast and not an error of the whole
    // modal
    if (categoriesResult.status === 'rejected') {
        showErrorToast(
            getBricksErrorMessage(categoriesResult.reason, t('bricks.media.categoryLoadFailed'))
        );
    }
}

/** Closes the modal. */
function handleClose(): void {
    emit('close');
    selectedItemId.value = null;
}

/**
 * Shows a toast about an error.
 */
function showErrorToast(message: string): void {
    toastMessage.value = message;
    toastVisible.value = true;
}

/**
 * Returns the category for an upload, out of the active filter.
 *
 * There is no target for uploading "into the common list" any more: under the "All"
 * filter a file is stored with no category and is seen in that same "All" only.
 *
 * @returns The category of the file being stored, or null.
 */
function resolveUploadCategory(): string | null {
    return categoryFilter.value !== ALL_MEDIA_CATEGORIES_FILTER ? categoryFilter.value : null;
}

/**
 * Uploads the files coming out of the upload zone.
 *
 * The check of the right is no duplicate of the hidden controls: the drop target catches
 * a drag over the whole grid, and it would stay a working way into an upload for a role
 * whose buttons have been taken away already.
 */
async function handleUpload(files: File[]): Promise<void> {
    if (!canEdit.value) {
        return;
    }

    await uploadFiles(files);
}

/**
 * Opens the system file picker from the upload tile: the input itself lives in the
 * controls of the header, and a second one just like it in the grid would mean two
 * points of truth about which file types are accepted.
 */
function handleUploadRequest(): void {
    if (!canEdit.value) {
        return;
    }

    uploadControlsRef.value?.openFilePicker();
}

/** Takes the changed optimization parameters out of the popover */
function handleOptimizationChange(value: IBricksMediaOptimization): void {
    uploadOptimization.value = value;
}

/** Handles item selection. */
function handleSelectItem(item: IMediaItem): void {
    if (props.context === 'publish') {
        emit('select', item);
        handleClose();
        return;
    }
    selectedItemId.value = item.id;
}

/** Inserts selected image and closes modal. */
function handleInsert(): void {
    if (!selectedItem.value) {
        return;
    }

    emit('select', selectedItem.value);
    handleClose();
}

/**
 * Drops the filter and the search. The empty result needs it: without it, getting out
 * of that result means finding and pressing the active tab, and with a category picked
 * alongside a typed query that takes two actions.
 */
function handleResetFilter(): void {
    categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
    searchQuery.value = '';
}

/** Saves the changed metadata of the selected item; a refusal becomes a toast */
async function handleUpdateMeta(meta: IMediaUpdateMetaRequest): Promise<void> {
    const item = selectedItem.value;

    if (!item || !canEdit.value) {
        return;
    }

    try {
        await mediaStore.updateItemMeta(item.id, meta);
    } catch (error: unknown) {
        showErrorToast(getBricksErrorMessage(error, t('bricks.media.updateMetaFailed')));
    }
}

/**
 * Updates the category of the selected item; a refusal becomes a toast. null takes the
 * category off the file.
 *
 * The refusal has to be handled right here: without the await, the rejection of the
 * store would go into a promise nobody handles.
 *
 * @param category - The new category of the file, or null.
 */
async function handleUpdateCategory(category: string | null): Promise<void> {
    const item = selectedItem.value;

    if (!item || !canEdit.value) {
        return;
    }

    try {
        await mediaStore.updateItemCategory(item.id, category);
    } catch (error: unknown) {
        showErrorToast(getBricksErrorMessage(error, t('bricks.media.updateCategoryFailed')));
    }
}

/**
 * Drops a filter pointing at a deleted category: otherwise it would refer to something
 * that is gone, and the grid would be left demonstratively empty.
 *
 * @param slug - The deleted category.
 */
function handleCategoryDeleted(slug: string): void {
    if (categoryFilter.value === slug) {
        categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
    }
}

/** Opens the deletion confirmation modal */
function handleRemoveItem(): void {
    if (!selectedItemId.value) {
        return;
    }
    isDeleteConfirmOpen.value = true;
}

/**
 * Confirms the deletion of the selected item.
 *
 * A definite refusal of the server leaves the confirmation open — the item is where it
 * was, a repeat is safe and right at hand. A break by the waiting ceiling closes it: the
 * outcome is unknown, the file may well have been deleted, and a repeat would then answer
 * 404 — the message about that asks outright to refresh the data first, and the store is
 * already rereading the list on its own.
 */
async function handleConfirmDelete(): Promise<void> {
    if (!selectedItemId.value || !canDelete.value) {
        return;
    }
    isDeleting.value = true;
    try {
        await mediaStore.removeItem(selectedItemId.value);
        selectedItemId.value = null;
        isDeleteConfirmOpen.value = false;
    } catch (error: unknown) {
        showErrorToast(getBricksErrorMessage(error, t('bricks.media.deleteFailed')));

        if (isRequestTimeoutError(error)) {
            isDeleteConfirmOpen.value = false;
        }
    } finally {
        isDeleting.value = false;
    }
}

/** Closes the deletion confirmation modal */
function handleCloseDeleteConfirm(): void {
    isDeleteConfirmOpen.value = false;
}

/** Opens the full-screen preview of an image */
function handleOpenPreview(item: IMediaItem): void {
    previewItem.value = item;
}

/** Closes the full-screen preview */
function handleClosePreview(): void {
    previewItem.value = null;
}

/**
 * Handles Escape inside the modal: while the preview is open it closes that alone,
 * keeping Reka from closing the gallery itself.
 *
 * @param event - The keyboard event coming from the Reka dialog.
 */
function handleEscapeKeyDown(event: KeyboardEvent): void {
    if (previewItem.value) {
        event.preventDefault();
        handleClosePreview();
    }
}
// #endregion

// #region Lifecycle
// Mounting coincides with the first opening: the callers hold a latch and do not create
// the component before it. So the first showing loads the data from here — `visible` is
// already `true` by the time of the mount, and the watch below does not fire on it; what
// is left to that watch is the repeated openings.
onMounted(() => {
    loadGalleryData();
});

watch(
    () => props.visible,
    (visible) => {
        if (visible) {
            selectedItemId.value = null;
            categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
            searchQuery.value = '';
            uploadOptimization.value = { ...defaultOptimization };
            loadGalleryData();
            return;
        }

        // The confirmations render outside the gallery's `BricksModal`, so closing it
        // does not take them down: the dialog went on hanging over the application — over
        // an already different session of the builder among other things, when a reset of
        // the session is what puts the gallery out. The lightbox lives inside the modal
        // and unmounts on its own, but its `previewItem` would otherwise surface at the
        // next opening
        isDeleteConfirmOpen.value = false;
        resetCategoryActions();
        previewItem.value = null;
        resetFileDrop();
    }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.visible"
        :title="t('bricks.media.galleryTitle')"
        variant="gradient"
        padded
        layer="nested"
        @close="handleClose"
        @escape-key-down="handleEscapeKeyDown"
    >
        <div
            :class="$style.modal"
            @dragover="handleDragOver"
            @dragenter="handleDragEnter"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
        >
            <BricksModalHeader size="lg" @close="handleClose">
                <template #subtitle>
                    {{ librarySummary }} · {{ t('bricks.media.dropAnywhereHint') }}
                </template>

                <template #actions>
                    <BricksSearchInput
                        :class="$style.search"
                        :value="searchQuery"
                        :placeholder="t('bricks.media.searchPlaceholder')"
                        @update:value="searchQuery = $event"
                    />

                    <BuilderMediaGalleryUploadControls
                        v-if="canEdit"
                        ref="uploadControlsRef"
                        :max-image-size-mb="maxImageSizeMb"
                        :max-video-size-mb="maxVideoSizeMb"
                        :optimization="uploadOptimization"
                        :configured-max-width="defaultOptimization.maxWidth"
                        :upload-progress="uploadProgress"
                        @upload="handleUpload"
                        @update:optimization="handleOptimizationChange"
                    />
                </template>
            </BricksModalHeader>

            <div :class="[$style.content, 'bricks-scrollbox']">
                <BuilderMediaGalleryFilters
                    v-model:category-filter="categoryFilter"
                    :categories="categories"
                    :category-counts="categoryCounts"
                    :total-count="hasLibrarySnapshot ? mediaItems.length : null"
                    :is-creating-category="isCreatingCategory"
                    @create-category="handleCreateCategory"
                    @delete-category="handleRequestCategoryDelete"
                />

                <div :class="$style.gridArea">
                    <Transition mode="out-in" name="bricks-fade-fast">
                        <BuilderMediaGalleryGrid
                            v-if="hasFilteredItems || isUploading"
                            :key="categoryFilter"
                            :items="filteredMediaItems"
                            :selected-item-id="selectedItemId"
                            :show-skeleton="isUploading"
                            :show-upload-tile="!searchQuery"
                            @select="handleSelectItem"
                            @preview="handleOpenPreview"
                            @upload="handleUploadRequest"
                        />

                        <BricksEmptyState
                            v-else-if="hasItems"
                            :class="$style.emptyState"
                            icon="ta:outline-filter"
                            :title="t('bricks.media.emptyFiltered')"
                        >
                            <BricksButton size="sm" variant="ghost" @click="handleResetFilter">
                                {{ t('bricks.media.resetFilter') }}
                            </BricksButton>
                        </BricksEmptyState>

                        <BricksEmptyState
                            v-else
                            :class="$style.emptyState"
                            icon="ta:outline-photo"
                            :title="t('bricks.media.emptyNoUploads')"
                            :description="t('bricks.media.emptyNoUploadsHint')"
                        />
                    </Transition>

                    <Transition name="bricks-fade-fast">
                        <BuilderMediaGalleryDropOverlay
                            v-if="isDraggingFiles"
                            :file-count="draggedFileCount"
                            :max-image-size-mb="maxImageSizeMb"
                            :max-video-size-mb="maxVideoSizeMb"
                            :optimization="uploadOptimization"
                        />
                    </Transition>
                </div>
            </div>

            <div :class="$style.footer">
                <BuilderMediaGalleryMetaPanel
                    :selected-item="selectedItem"
                    :categories="categories"
                    :show-picker-actions="shouldShowPickerActions"
                    @update-meta="handleUpdateMeta"
                    @update-category="handleUpdateCategory"
                    @remove="handleRemoveItem"
                    @close="handleClose"
                    @insert="handleInsert"
                />
            </div>
        </div>

        <BuilderMediaGalleryPreviewLightbox :item="previewItem" @close="handleClosePreview" />
    </BricksModal>

    <BricksToast v-model:visible="toastVisible" :message="toastMessage" variant="error" />

    <BricksConfirmModal
        :is-open="isDeleteConfirmOpen"
        :title="t('bricks.media.deleteImageTitle')"
        :description="t('bricks.media.deleteImageDescription')"
        :confirm-text="t('bricks.common.delete')"
        confirm-variant="danger"
        :is-loading="isDeleting"
        @confirm="handleConfirmDelete"
        @close="handleCloseDeleteConfirm"
    />

    <BricksConfirmModal
        :is-open="categoryPendingDeletion !== null"
        :title="deleteCategoryTitle"
        :description="deleteCategoryDescription"
        :confirm-text="t('bricks.common.delete')"
        confirm-variant="danger"
        :is-loading="isDeletingCategory"
        @confirm="handleConfirmCategoryDelete"
        @close="handleCloseCategoryDelete"
    />
</template>

<style module lang="scss">
.modal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 140rem;
    max-height: 80vh;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-xl);
    flex-direction: column;
}

.search {
    width: 28rem;
}

.gridArea {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
}

.content {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    flex: 1;
    padding: 2.4rem;
}

.emptyState {
    padding: 4rem 2rem;
}

.footer {
    display: flex;
    align-items: center;
    padding: 1.6rem 2.4rem;
    border-top: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
}
</style>
