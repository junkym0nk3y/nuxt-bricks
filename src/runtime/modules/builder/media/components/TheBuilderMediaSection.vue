<script setup lang="ts">
/**
 * @description The body of the "Media" section of the dashboard: the track of
 * categories, the grid of files, the empty states and the drop target.
 *
 * A section and not a modal: the file manager is a part of the dashboard just as
 * "Pages", "Templates" and "Users" are. The modal stayed where picking a file is a step
 * inside some other work (the sidebar of the builder, the OG image of a page).
 *
 * A controller component as far as its own part goes: managing the categories and
 * confirming their deletion live here. The upload and the selected file do not: the
 * upload button stands in the header of the dashboard, the details panel in a slot of
 * the shell, and both states are held by `usePublishMediaSurface` in the host.
 *
 * The upload parameters stand in the row of filters rather than in the header: they are
 * about what the file will look like when it goes, and their place is next to the track
 * of categories — the thing that decides WHERE it goes. The gate of the role is at the
 * row of filters itself: the tail of the row is drawn only with the right to edit.
 *
 * The dissolve of the grid, the key of the transition and the bounds of the drop target
 * are the same here as in `TheBuilderMediaGalleryModal`, where the reasons are written
 * down.
 *
 * Decisions held by the style section: the section stretches to the full height of the
 * list area, otherwise the footer with the summary would stand right under the grid,
 * that is, in the middle of the screen while there are few files; the area of the grid
 * is the positioning container of the drop target, so it stretches over the grid's place
 * rather than over the whole body of the section; and the summary band sticks to the
 * bottom of the list area with negative margins that stretch it across the full width
 * of the area along with its padding — without them the line would break off before
 * reaching the edges. The footer stays put rather than traveling with the grid: the
 * summary and the drag hint are about the whole media library.
 */

// #region Imports
// Types
import type { IBricksMediaOptimization, IMediaItem } from '../../../common/types/media';
import type { IMediaSectionProps, IMediaSectionEmits } from '../types/media';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
import { formatFileSize } from '../utils/formatFileSize';
import { getBricksErrorMessage } from '../../../common/utils/main';
import { resolveMediaCategoryLabelBySlug } from '../utils/categoryLabels';

// Vue
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useMediaStore } from '../stores/media';
import { useMediaCategoriesStore } from '../stores/mediaCategories';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useMediaCategoryActions } from '../composables/useMediaCategoryActions';
import { useMediaGalleryFileDrop } from '../composables/useMediaGalleryFileDrop';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksEmptyState from '../../../ui/feedback/BricksEmptyState.vue';
import BuilderMediaGalleryFilters from './BuilderMediaGalleryFilters.vue';
import BuilderMediaGalleryGrid from './BuilderMediaGalleryGrid.vue';
import BuilderMediaGalleryDropOverlay from './BuilderMediaGalleryDropOverlay.vue';
import BuilderMediaGalleryUploadOptionsPopover from './BuilderMediaGalleryUploadOptionsPopover.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaSectionProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaSectionEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const mediaStore = useMediaStore();
const categoriesStore = useMediaCategoriesStore();
/**
 * The right to write decides more than the fate of the buttons: the drop target is
 * just as much an invitation to upload a file, and under a role without that right it
 * would unfold a "let go — and it uploads" overlay over an action the guard silently
 * cuts off.
 */
const { canEdit } = useBuilderPermissions();

const {
    draggedFileCount,
    isDraggingFiles,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
} = useMediaGalleryFileDrop({
    onFiles: (files: File[]) => emit('upload', files),
    isEnabled: () => canEdit.value,
});
// #endregion

// #region Computed
const mediaItems = computed<IMediaItem[]>(() => mediaStore.items);
const isUploading = computed<boolean>(() => mediaStore.isUploading);
const hasItems = computed<boolean>(() => mediaItems.value.length > 0);

/**
 * The counters of the tabs are computed off the list already loaded — there is no
 * request of their own. Files with no category fall into no counter at all: they are
 * seen under "All" only.
 */
const categoryCounts = computed<Record<string, number>>(() =>
    mediaItems.value.reduce<Record<string, number>>((counts, item) => {
        if (item.category) {
            counts[item.category] = (counts[item.category] ?? 0) + 1;
        }

        return counts;
    }, {})
);

/**
 * The actions over the categories. Down here among the computeds rather than up in the
 * data: the composable reads `categoryCounts` for the text of the confirmation, and
 * reaching for it above its declaration would break the order even inside a deferred
 * closure.
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
} = useMediaCategoryActions({
    resolveCategoryCount: (slug: string) => categoryCounts.value[slug] ?? 0,
    onCategoryDeleted: handleCategoryDeleted,
    onError: (message: string) => emit('notify', message, 'error'),
});

/**
 * The filtered list of the grid: the category out of the track, then the search
 * string.
 *
 * Below `useMediaCategoryActions`, because the search matches against the CAPTION of a
 * category, and the list of captions comes from there. Matching against `item.category`
 * will not do: what lies there is a slug, so a search by a caption would find nothing —
 * the data holds its transliteration.
 */
const filteredMediaItems = computed<IMediaItem[]>(() => {
    const filterValue = props.categoryFilter;
    const query = props.searchQuery.trim().toLowerCase();

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

const hasFilteredItems = computed<boolean>(() => filteredMediaItems.value.length > 0);

/**
 * The summary of the media library in the footer of the section: how many files there
 * are, how much they weigh and the hint about dragging. It is about the whole library
 * rather than about what the filter left, so it is counted off the full list —
 * otherwise a selected category would look like "the media library has shrunk".
 *
 * The hint has to be visible at all times: the interface has no permanent upload zone,
 * and the drop target shows up only once the files are already over the window.
 */
const librarySummary = computed<string>(() => {
    const totalSize = mediaItems.value.reduce((sum, item) => sum + item.size, 0);
    const summary = t('bricks.media.librarySummaryShort', {
        count: mediaItems.value.length,
        size: formatFileSize(totalSize),
    });

    if (!canEdit.value) {
        return summary;
    }

    // A hint of its own rather than the modal's: the target hangs on the body of the
    // section and not on the whole window — a file dropped on the rail or on the header
    // is not taken
    return `${summary} · ${t('bricks.media.dropSectionHint')}`;
});

/**
 * The hint of the empty state: how to put the first file in here. A role with no right
 * to write has none of it — both of the ways it names are closed to that role, and the
 * invitation would call it into a dead end. The text is its own rather than the modal's:
 * the target is bounded by the body of the section.
 */
const emptyStateHint = computed<string>(() =>
    canEdit.value ? t('bricks.media.emptyNoUploadsSectionHint') : ''
);

/**
 * Whether the contents of the media library have been read. Until the first successful
 * answer "the media library is empty" must not be shown: the list is empty when the read
 * never got through as well, while such a message claims that there are no files.
 */
const hasLibrarySnapshot = computed<boolean>(() => mediaStore.hasLoadedItemsSnapshot);
// #endregion

// #region Methods
/**
 * Passes the changed upload parameters upward: they are owned by the surface of the
 * host — the button of the header uploads files by them.
 *
 * @param value - The new optimization parameters.
 */
function handleOptimizationChange(value: IBricksMediaOptimization): void {
    emit('update:uploadOptimization', value);
}

/**
 * Passes a change of the category upward: it is owned by the surface of the host — the
 * category of the uploaded files depends on it, and the upload button stands in the
 * header.
 *
 * @param value - The category that was picked.
 */
function handleCategoryFilterChange(value: string): void {
    emit('update:categoryFilter', value);
}

/**
 * Drops a filter pointing at a deleted category: otherwise it would refer to something
 * that is gone, and the grid would be left demonstratively empty.
 *
 * @param slug - The deleted category.
 */
function handleCategoryDeleted(slug: string): void {
    if (props.categoryFilter === slug) {
        emit('update:categoryFilter', ALL_MEDIA_CATEGORIES_FILTER);
    }
}

/**
 * Asks the host to open the details panel of a file.
 *
 * @param item - The file that was picked.
 */
function handleSelectItem(item: IMediaItem): void {
    emit('select', item);
}

/**
 * Asks the host to open a file full screen.
 *
 * @param item - The file.
 */
function handlePreviewItem(item: IMediaItem): void {
    emit('preview', item);
}

/**
 * The upload tile asks for the system file picker.
 */
function handleUploadRequest(): void {
    emit('request-upload');
}

/**
 * An empty result of the filter: the category and the search string are dropped in one
 * go — the search is owned by the header, the category by the surface of the host.
 */
function handleResetFilter(): void {
    emit('reset-filters');
}

/**
 * Reads the categories when there is no trustworthy snapshot yet.
 *
 * The list of files is not read here: the host takes it — the counter of the rail is
 * drawn before the section is ever opened. The categories, on the other hand, are needed
 * by this section alone, and so they are read on its first showing rather than at the
 * start of the dashboard.
 */
async function loadCategories(): Promise<void> {
    if (categoriesStore.hasLoadedCategoriesSnapshot) {
        return;
    }

    try {
        await categoriesStore.loadCategories();
    } catch (error: unknown) {
        // A refusal of the categories does not cancel the section: the files are
        // visible without the row of tabs too
        emit('notify', getBricksErrorMessage(error, t('bricks.media.categoryLoadFailed')), 'error');
    }
}
// #endregion

// #region Lifecycle
onMounted(() => {
    loadCategories();
});
// #endregion
</script>

<template>
    <div
        :class="$style.TheBuilderMediaSection"
        @dragover="handleDragOver"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <BuilderMediaGalleryFilters
            :category-filter="props.categoryFilter"
            :categories="categories"
            :category-counts="categoryCounts"
            :total-count="hasLibrarySnapshot ? mediaItems.length : null"
            :is-creating-category="isCreatingCategory"
            @update:category-filter="handleCategoryFilterChange"
            @create-category="handleCreateCategory"
            @delete-category="handleRequestCategoryDelete"
        >
            <template #actions>
                <BuilderMediaGalleryUploadOptionsPopover
                    :optimization="props.uploadOptimization"
                    :configured-max-width="props.configuredMaxWidth"
                    tooltip-side="top"
                    @update:optimization="handleOptimizationChange"
                />
            </template>
        </BuilderMediaGalleryFilters>

        <div :class="$style.gridArea">
            <Transition mode="out-in" name="bricks-fade-fast">
                <BuilderMediaGalleryGrid
                    v-if="hasFilteredItems || isUploading"
                    :key="props.categoryFilter"
                    :items="filteredMediaItems"
                    :selected-item-id="props.selectedItemId"
                    :show-skeleton="isUploading"
                    :show-upload-tile="!props.searchQuery"
                    @select="handleSelectItem"
                    @preview="handlePreviewItem"
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
                    v-else-if="hasLibrarySnapshot"
                    :class="$style.emptyState"
                    icon="ta:outline-photo"
                    :title="t('bricks.media.emptyNoUploads')"
                    :description="emptyStateHint"
                />
            </Transition>

            <Transition name="bricks-fade-fast">
                <BuilderMediaGalleryDropOverlay
                    v-if="isDraggingFiles"
                    :file-count="draggedFileCount"
                    :max-image-size-mb="props.maxImageSizeMb"
                    :max-video-size-mb="props.maxVideoSizeMb"
                    :optimization="props.uploadOptimization"
                />
            </Transition>
        </div>

        <p v-if="hasLibrarySnapshot" :class="$style.summary">{{ librarySummary }}</p>

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
    </div>
</template>

<style module lang="scss">
.TheBuilderMediaSection {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 1.6rem;
    min-height: 100%;
}

.gridArea {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
}

.emptyState {
    padding: 4rem 2rem;
}

.summary {
    position: sticky;
    bottom: -2rem;
    margin: 0 -2.4rem -2rem;
    padding: 1.2rem 2.4rem;
    border-top: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    font-size: 1.2rem;
    color: var(--bricks-text-muted);
}
</style>
