<script setup lang="ts">
// #region Imports

// Types
import type { IMediaItem, IMediaUpdateMetaRequest } from '../../../common/types/media';
import type { IMediaGalleryProps, IMediaGalleryEmits } from '../types/media';

// Utils
import { DEFAULT_MEDIA_CATEGORY } from '../constants/mediaCategories';

// Vue
import { ref, computed, watch, onMounted } from 'vue';

// Pinia
import { useMediaStore } from '../stores/media';

// Composables
import { useMediaUpload } from '../composables/useMediaUpload';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BuilderMediaGalleryFilters from './BuilderMediaGalleryFilters.vue';
import BuilderMediaGalleryUploadArea from './BuilderMediaGalleryUploadArea.vue';
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
const mediaStore = useMediaStore();
const selectedItemId = ref<number | null>(null);
const categoryFilter = ref<string>('all');
const searchQuery = ref('');
const previewItem = ref<IMediaItem | null>(null);
const isDeleteConfirmOpen = ref(false);
const isDeleting = ref(false);
const toastVisible = ref(false);
const toastMessage = ref('');

const { maxImageSizeMb, maxVideoSizeMb, uploadFiles } = useMediaUpload({
    resolveCategory: resolveUploadCategory,
    onError: showErrorToast,
});
// #endregion

// #region Computed
const shouldShowPickerActions = computed<boolean>(() => props.context === 'properties');
const mediaItems = computed(() => mediaStore.items);
const isUploading = computed(() => mediaStore.isUploading);
const hasItems = computed(() => mediaItems.value.length > 0);
const selectedItem = computed(
    () => mediaItems.value.find((item) => item.id === selectedItemId.value) ?? null
);
const filteredMediaItems = computed(() => {
    const filterValue = categoryFilter.value;
    const query = searchQuery.value.trim().toLowerCase();

    return mediaItems.value.filter((item) => {
        const matchesCategory = filterValue === 'all' || item.category === filterValue;
        const matchesSearch =
            !query ||
            item.filename.toLowerCase().includes(query) ||
            item.alt.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
    });
});
const hasFilteredItems = computed(() => filteredMediaItems.value.length > 0);
// #endregion

// #region Methods
/**
 * Загружает медиа с обработкой ошибок.
 */
async function loadMediaItems(): Promise<void> {
    try {
        await mediaStore.loadItems();
    } catch (error: unknown) {
        const message =
            (error as { message?: string })?.message ||
            'Не удалось загрузить медиа. Проверьте подключение к базе.';
        emit('error', message);
    }
}

/** Closes the modal. */
function handleClose(): void {
    emit('close');
    selectedItemId.value = null;
}

/**
 * Показывает toast-уведомление об ошибке.
 */
function showErrorToast(message: string): void {
    toastMessage.value = message;
    toastVisible.value = true;
}

/**
 * Возвращает категорию для загрузки на основе активного фильтра.
 *
 * @returns Имя категории для сохраняемого файла.
 */
function resolveUploadCategory(): string {
    return categoryFilter.value !== 'all' ? categoryFilter.value : DEFAULT_MEDIA_CATEGORY;
}

/** Загружает файлы из upload-зоны. */
async function handleUpload(files: File[]): Promise<void> {
    await uploadFiles(files);
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

/** Сохраняет изменённые метаданные выбранного элемента. */
async function handleUpdateMeta(meta: IMediaUpdateMetaRequest): Promise<void> {
    if (!selectedItem.value) {
        return;
    }
    await mediaStore.updateItemMeta(selectedItem.value.id, meta);
}

/** Обновляет категорию выбранного элемента. */
function handleUpdateCategory(category: string): void {
    if (!selectedItem.value) {
        return;
    }
    mediaStore.updateItemCategory(selectedItem.value.id, category);
}

/** Открывает модалку подтверждения удаления. */
function handleRemoveItem(): void {
    if (!selectedItemId.value) {
        return;
    }
    isDeleteConfirmOpen.value = true;
}

/** Подтверждает удаление выбранного элемента. */
async function handleConfirmDelete(): Promise<void> {
    if (!selectedItemId.value) {
        return;
    }
    isDeleting.value = true;
    try {
        await mediaStore.removeItem(selectedItemId.value);
        selectedItemId.value = null;
    } finally {
        isDeleting.value = false;
        isDeleteConfirmOpen.value = false;
    }
}

/** Закрывает модалку подтверждения удаления. */
function handleCloseDeleteConfirm(): void {
    isDeleteConfirmOpen.value = false;
}

/** Открывает полноэкранный предпросмотр изображения. */
function handleOpenPreview(item: IMediaItem): void {
    previewItem.value = item;
}

/** Закрывает полноэкранный предпросмотр. */
function handleClosePreview(): void {
    previewItem.value = null;
}

/**
 * Обрабатывает Escape внутри модалки: пока открыт предпросмотр,
 * закрывает только его, не давая Reka закрыть саму галерею.
 *
 * @param event - Событие клавиатуры от Reka Dialog.
 */
function handleEscapeKeyDown(event: KeyboardEvent): void {
    if (previewItem.value) {
        event.preventDefault();
        handleClosePreview();
    }
}
// #endregion

// #region Lifecycle
onMounted(() => {
    loadMediaItems();
});

watch(
    () => props.visible,
    (visible) => {
        if (visible) {
            selectedItemId.value = null;
            categoryFilter.value = 'all';
            searchQuery.value = '';
            loadMediaItems();
        }
    }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.visible"
        title="Управление медия-контентом"
        variant="gradient"
        padded
        :z-index="99999"
        @close="handleClose"
        @escape-key-down="handleEscapeKeyDown"
    >
        <div :class="$style.modal">
            <!-- Header -->
            <div :class="$style.header">
                <h2 :class="$style.title">Управление медия-контентом</h2>
                <BricksCloseButton @click="handleClose" />
            </div>

            <!-- Content -->
            <div :class="[$style.content, 'scrollbox']">
                <BuilderMediaGalleryFilters
                    v-model:category-filter="categoryFilter"
                    v-model:search-query="searchQuery"
                    :class="$style.filters"
                />

                <BuilderMediaGalleryUploadArea
                    :max-image-size-mb="maxImageSizeMb"
                    :max-video-size-mb="maxVideoSizeMb"
                    @upload="handleUpload"
                />

                <BuilderMediaGalleryGrid
                    v-if="hasFilteredItems"
                    :items="filteredMediaItems"
                    :selected-item-id="selectedItemId"
                    @select="handleSelectItem"
                    @preview="handleOpenPreview"
                />

                <div v-else-if="hasItems && !isUploading" :class="$style.emptyState">
                    <BricksIcon :class="$style.emptyIcon" icon="md:filter-list" />
                    <p :class="$style.emptyText">Нет файлов, подходящих под фильтр</p>
                </div>

                <!-- Empty State -->
                <div v-else-if="!isUploading" :class="$style.emptyState">
                    <BricksIcon :class="$style.emptyIcon" icon="md:outlined-image" />
                    <p :class="$style.emptyText">Нет загруженных изображений</p>
                </div>

                <!-- Loading State -->
                <div v-if="isUploading" :class="$style.loading">
                    <BricksIcon :class="$style.loadingIcon" icon="ui:loading" />
                    <p>Загружаю файл...</p>
                </div>
            </div>

            <!-- Footer -->
            <div :class="$style.footer">
                <BuilderMediaGalleryMetaPanel
                    :selected-item="selectedItem"
                    @update-meta="handleUpdateMeta"
                    @update-category="handleUpdateCategory"
                    @remove="handleRemoveItem"
                />
                <div v-if="shouldShowPickerActions" :class="$style.footerRight">
                    <BricksButton size="md" variant="secondary" @click="handleClose">
                        Отменить
                    </BricksButton>
                    <BricksButton
                        size="md"
                        variant="primary"
                        :disabled="!selectedItemId"
                        @click="handleInsert"
                    >
                        Выбрать
                    </BricksButton>
                </div>
            </div>
        </div>

        <!-- Fullscreen Preview Lightbox -->
        <BuilderMediaGalleryPreviewLightbox :item="previewItem" @close="handleClosePreview" />
    </BricksModal>

    <!-- Upload Error Toast -->
    <BricksToast v-model:visible="toastVisible" :message="toastMessage" variant="error" />

    <!-- Delete Confirmation Modal -->
    <BricksConfirmModal
        :is-open="isDeleteConfirmOpen"
        title="Удалить изображение?"
        description="Это действие нельзя отменить. Изображение будет удалено безвозвратно."
        confirm-text="Удалить"
        confirm-variant="danger"
        :is-loading="isDeleting"
        @confirm="handleConfirmDelete"
        @close="handleCloseDeleteConfirm"
    />
</template>

<style module lang="scss">
.modal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 140rem;
    max-height: 80vh;
    border-radius: var(--border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--shadow-xl);
    flex-direction: column;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.title {
    margin: 0;
    font-size: 2rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.content {
    overflow-y: auto;
    flex: 1;
    padding: 2rem;
}

.filters {
    margin-bottom: 2rem;
}

.emptyState,
.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    flex-direction: column;
    gap: 1.6rem;
}

.emptyState {
    padding: 6rem 2rem;
}

.emptyText {
    margin: 0;
    font-size: 1.6rem;
    color: var(--bricks-base-600);
}

.emptyIcon {
    font-size: 8rem;
    color: var(--bricks-base-300);
}

.loadingIcon {
    font-size: 4rem;
    color: var(--bricks-primary-500);
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2rem;
    border-top: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
}

.footerRight {
    display: flex;
    gap: 1.2rem;
}
</style>
