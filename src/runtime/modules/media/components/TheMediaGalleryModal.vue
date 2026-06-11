<script setup lang="ts">
// #region Imports

// Types
import type { IMediaItem, IMediaUpdateMetaRequest } from '../../common/types/media';
import type { IMediaGalleryProps, IMediaGalleryEmits } from '../types/media';
import type { IAppConfig } from '../../common/types/config';

// Vue
import { ref, computed, watch, onMounted } from 'vue';

// Nuxt
import { useAppConfig } from 'nuxt/app';

// Pinia
import { useMediaStore } from '../stores/media';

// Components
import BricksButton from '../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../ui/base/modal/BricksModal.vue';
import BricksToast from '../../ui/feedback/BricksToast.vue';
import BricksConfirmModal from '../../ui/feedback/BricksConfirmModal.vue';
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
const CATEGORY_OPTIONS = [
    { label: 'Все', value: 'all' },
    { label: 'Иконки', value: 'icons' },
    { label: 'Иллюстрации', value: 'illustrations' },
    { label: 'Фотографии', value: 'photos' },
    { label: 'Видео', value: 'videos' },
    { label: 'Другое', value: 'other' },
];
const DEFAULT_MEDIA_CATEGORY = 'other';
const BYTES_IN_MB = 1024 * 1024;
const DEFAULT_MAX_IMAGE_SIZE_MB = 10;
const DEFAULT_MAX_VIDEO_SIZE_MB = 100;

const appConfig = useAppConfig() as IAppConfig;
const MAX_IMAGE_SIZE_MB = appConfig.bricks?.media?.maxUploadSizeMb ?? DEFAULT_MAX_IMAGE_SIZE_MB;
const MAX_VIDEO_SIZE_MB =
    appConfig.bricks?.media?.maxVideoUploadSizeMb ?? DEFAULT_MAX_VIDEO_SIZE_MB;

const mediaStore = useMediaStore();
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedItemId = ref<number | null>(null);
const dragOver = ref(false);
const categoryFilter = ref<string>('all');
const searchQuery = ref('');
const editableFilename = ref('');
const editableAlt = ref('');
const previewItem = ref<IMediaItem | null>(null);
const isDeleteConfirmOpen = ref(false);
const isDeleting = ref(false);
const toastVisible = ref(false);
const toastMessage = ref('');
// #endregion

// #region Computed
const shouldShowPickerActions = computed<boolean>(() => props.context === 'properties');
const mediaItems = computed(() => mediaStore.items);
const isUploading = computed(() => mediaStore.isUploading);
const hasItems = computed(() => mediaItems.value.length > 0);
const selectedItem = computed(() =>
    mediaItems.value.find((item) => item.id === selectedItemId.value)
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
const selectedCategory = computed({
    get: () => selectedItem.value?.category || DEFAULT_MEDIA_CATEGORY,
    set: (value: string) => {
        if (selectedItem.value) {
            mediaStore.updateItemCategory(selectedItem.value.id, value);
        }
    },
});
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

/** Opens file picker. */
function handleOpenFilePicker(): void {
    fileInputRef.value?.click();
}

/** Handles file selection from input. */
async function handleFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) {
        return;
    }

    await uploadFiles(Array.from(files));
    input.value = '';
}

/**
 * Проверяет, что файл является поддерживаемым медиа-типом (изображение или видео).
 */
function isSupportedMediaFile(file: File): boolean {
    return file.type.startsWith('image/') || file.type.startsWith('video/');
}

/**
 * Валидирует размер файла и возвращает сообщение об ошибке, если лимит превышен.
 */
function validateFileSize(file: File): string | null {
    const isVideo = file.type.startsWith('video/');
    const maxSizeMb = isVideo ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
    const maxSizeBytes = maxSizeMb * BYTES_IN_MB;

    if (file.size > maxSizeBytes) {
        const fileType = isVideo ? 'Видео' : 'Изображение';
        return `${fileType} «${file.name}» превышает лимит ${maxSizeMb} МБ`;
    }

    return null;
}

/**
 * Показывает toast-уведомление об ошибке.
 */
function showErrorToast(message: string): void {
    toastMessage.value = message;
    toastVisible.value = true;
}

/** Uploads multiple files and applies the active category. */
async function uploadFiles(files: File[]): Promise<void> {
    const category = resolveUploadCategory();

    for (const file of files) {
        if (!isSupportedMediaFile(file)) {
            console.warn('[MediaGallery] Skipping unsupported file:', file.name);
            continue;
        }

        const sizeError = validateFileSize(file);
        if (sizeError) {
            showErrorToast(sizeError);
            continue;
        }

        try {
            await mediaStore.uploadFile(file, category);
        } catch (error) {
            console.error('[MediaGallery] Upload failed for:', file.name, error);
        }
    }
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

/** Handles drag over event. */
function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    dragOver.value = true;
}

/** Handles drag leave event. */
function handleDragLeave(): void {
    dragOver.value = false;
}

/** Handles file drop. */
async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    dragOver.value = false;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
        return;
    }

    await uploadFiles(Array.from(files));
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

/** Formats file size to human-readable format. */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Обрабатывает изменение фильтра по категории. */
function handleFilterChange(value: string): void {
    categoryFilter.value = value;
}

/** Обновляет категорию для выбранного элемента. */
function handleSelectedCategoryChange(value: string): void {
    selectedCategory.value = value;
}

/**
 * Возвращает категорию для загрузки на основе активного фильтра.
 *
 * @returns Имя категории для сохраняемого файла.
 */
function resolveUploadCategory(): string {
    return categoryFilter.value !== 'all' ? categoryFilter.value : DEFAULT_MEDIA_CATEGORY;
}

/**
 * Сохраняет изменённые метаданные (filename, alt) при потере фокуса.
 */
async function handleMetaBlur(): Promise<void> {
    if (!selectedItem.value) {
        return;
    }

    const meta: IMediaUpdateMetaRequest = {};
    const trimmedFilename = editableFilename.value.trim();
    const trimmedAlt = editableAlt.value.trim();

    if (trimmedFilename && trimmedFilename !== selectedItem.value.filename) {
        meta.filename = trimmedFilename;
    }

    if (trimmedAlt !== selectedItem.value.alt) {
        meta.alt = trimmedAlt;
    }

    if (Object.keys(meta).length === 0) {
        return;
    }

    await mediaStore.updateItemMeta(selectedItem.value.id, meta);
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

watch(selectedItem, (item) => {
    editableFilename.value = item?.filename ?? '';
    editableAlt.value = item?.alt ?? '';
});
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
                <!-- Filters -->
                <div :class="$style.filters">
                    <div :class="$style.filterGroup">
                        <span :class="$style.filterLabel">Категория:</span>
                        <div :class="$style.chipGroup">
                            <button
                                v-for="option in CATEGORY_OPTIONS"
                                :key="option.value"
                                type="button"
                                :class="[
                                    $style.filterChip,
                                    { [$style._active]: categoryFilter === option.value },
                                ]"
                                @click="handleFilterChange(option.value)"
                            >
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div :class="$style.filterGroup">
                        <label :class="$style.filterLabel" for="media-search">Поиск:</label>
                        <input
                            id="media-search"
                            v-model="searchQuery"
                            :class="$style.searchInput"
                            type="text"
                            placeholder="Введите название или alt"
                        />
                    </div>
                </div>

                <!-- Upload Area -->
                <div
                    :class="[$style.uploadArea, { [$style.dragOver]: dragOver }]"
                    @dragover="handleDragOver"
                    @dragleave="handleDragLeave"
                    @drop="handleDrop"
                >
                    <input
                        ref="fileInputRef"
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        :class="$style.fileInput"
                        @change="handleFileChange"
                    />
                    <BricksIcon :class="$style.uploadIcon" icon="md:cloud-upload" />
                    <p :class="$style.uploadText">
                        Перетащите файлы сюда или нажмите, чтобы выбрать
                    </p>
                    <BricksButton size="md" variant="primary" @click="handleOpenFilePicker">
                        Выбрать файлы
                    </BricksButton>
                    <p :class="$style.uploadHint">
                        Изображения — до {{ MAX_IMAGE_SIZE_MB }} МБ, видео — до
                        {{ MAX_VIDEO_SIZE_MB }} МБ
                    </p>
                </div>

                <!-- Gallery Grid -->
                <div v-if="hasFilteredItems" :class="$style.gallery">
                    <div
                        v-for="item in filteredMediaItems"
                        :key="item.id"
                        :class="[
                            $style.galleryItem,
                            { [$style.selected]: selectedItemId === item.id },
                        ]"
                        @click="handleSelectItem(item)"
                    >
                        <div :class="$style.imageWrapper">
                            <div
                                v-if="item.mimeType.startsWith('video/')"
                                :class="$style.videoPlaceholder"
                            >
                                <BricksIcon
                                    :class="$style.videoPlayIcon"
                                    icon="md:sharp-video-library"
                                />
                            </div>
                            <img
                                v-else
                                :src="item.url"
                                :alt="item.alt || item.filename"
                                :class="$style.image"
                                loading="lazy"
                                decoding="async"
                            />
                            <button
                                type="button"
                                :class="$style.previewBtn"
                                title="Полноэкранный просмотр"
                                @click.stop="handleOpenPreview(item)"
                            >
                                <BricksIcon icon="ph:magnifying-glass" />
                            </button>
                        </div>
                        <div :class="$style.itemInfo">
                            <span :class="$style.filename">{{ item.filename }}</span>
                            <span :class="$style.filesize">{{ formatFileSize(item.size) }}</span>
                            <span :class="$style.categoryBadge">{{ item.category }}</span>
                        </div>
                    </div>
                </div>

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
                <div :class="$style.footerLeft">
                    <template v-if="selectedItem">
                        <div :class="$style.metaField">
                            <label :class="$style.selectorLabel" for="media-filename">
                                Название:
                            </label>
                            <input
                                id="media-filename"
                                v-model="editableFilename"
                                :class="$style.metaInput"
                                type="text"
                                placeholder="Имя файла"
                                @blur="handleMetaBlur"
                            />
                        </div>
                        <div :class="$style.metaField">
                            <label :class="$style.selectorLabel" for="media-alt"> Alt: </label>
                            <input
                                id="media-alt"
                                v-model="editableAlt"
                                :class="$style.metaInput"
                                type="text"
                                placeholder="Описание изображения"
                                @blur="handleMetaBlur"
                            />
                        </div>
                        <div :class="$style.categorySelector">
                            <label :class="$style.selectorLabel" for="media-category">
                                Категория:
                            </label>
                            <select
                                id="media-category"
                                :value="selectedCategory"
                                :class="$style.categorySelect"
                                @change="
                                    handleSelectedCategoryChange(
                                        ($event.target as HTMLSelectElement).value
                                    )
                                "
                            >
                                <option
                                    v-for="option in CATEGORY_OPTIONS.filter(
                                        (opt) => opt.value !== 'all'
                                    )"
                                    :key="option.value"
                                    :value="option.value"
                                >
                                    {{ option.label }}
                                </option>
                            </select>
                        </div>
                    </template>
                    <BricksButton
                        v-if="selectedItemId"
                        size="sm"
                        variant="danger"
                        @click="handleRemoveItem"
                    >
                        <BricksIcon icon="md:delete" />
                    </BricksButton>
                </div>
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
        <Transition name="library-modal-fade">
            <div v-if="previewItem" :class="$style.previewOverlay" @click.self="handleClosePreview">
                <button type="button" :class="$style.previewClose" @click="handleClosePreview">
                    <BricksIcon icon="gl:close" />
                </button>
                <video
                    v-if="previewItem.mimeType.startsWith('video/')"
                    :src="previewItem.url"
                    :class="$style.previewImage"
                    controls
                    playsinline
                />
                <img
                    v-else
                    :src="previewItem.url"
                    :alt="previewItem.alt || previewItem.filename"
                    :class="$style.previewImage"
                    decoding="async"
                />
            </div>
        </Transition>
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
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    margin-bottom: 2rem;
}

.filterGroup {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
}

.filterLabel,
.selectorLabel {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-700);
}

.chipGroup {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
}

.filterChip {
    padding: 0.6rem 1.2rem;
    border-radius: 999px;
    border: 1px solid var(--bricks-base-300);
    background: transparent;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
    transition: all 150ms ease;
    cursor: pointer;

    &._active {
        border-color: var(--bricks-primary-500);
        background: var(--bricks-primary-50);
        color: var(--bricks-primary-600);
    }
}

.searchInput {
    flex: 1;
    min-width: 22rem;
    padding: 0.8rem 1.2rem;
    border-radius: 0.6rem;
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-50);
    font-size: 1.4rem;
    color: var(--bricks-base-900);
}

.uploadArea {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3.2rem 2rem;
    border-radius: var(--border-radius-md);
    border: 0.2rem dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    transition: all 200ms ease;
    cursor: pointer;
    flex-direction: column;
    gap: 1.2rem;

    &:hover {
        border-color: var(--bricks-primary-400);
        background: var(--bricks-primary-50);
    }

    &.dragOver {
        border-color: var(--bricks-primary-500);
        background: var(--bricks-primary-100);
    }
}

.fileInput {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

.uploadIcon {
    font-size: 4.8rem;
    color: var(--bricks-base-400);
}

.uploadText,
.emptyText {
    margin: 0;
    font-size: 1.6rem;
    color: var(--bricks-base-600);
}

.uploadHint {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: 1.6rem;
    margin-top: 2rem;
}

.galleryItem {
    --bricks-base-0: #fff;
    --bricks-base-200: #e5e7eb;
    --bricks-base-500: #6b7280;
    --bricks-base-600: #4b5563;
    --bricks-base-900: #111827;

    position: relative;
    overflow: hidden;
    border-radius: var(--border-radius-md);
    border: 0.2rem solid transparent;
    background: var(--bricks-base-0);
    transition: all 200ms ease;
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-primary-300);
        box-shadow: var(--shadow-md);
    }

    &.selected {
        border-color: var(--bricks-primary-500);
        box-shadow: 0 0 0 0.4rem rgb(var(--rgb-primary-500) / 20%);
    }
}

.imageWrapper {
    position: relative;

    &:hover .previewBtn {
        opacity: 1;
    }
}

.image {
    display: block;
    width: 100%;
    height: 12rem;
    object-fit: scale-down;
}

.videoPlaceholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 12rem;
    background: var(--bricks-base-100, #f3f4f6);
}

.videoPlayIcon {
    font-size: 4rem;
    color: var(--bricks-base-400);
}

.previewBtn {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
    border-radius: 0.6rem;
    border: none;
    background: rgb(0 0 0 / 50%);
    font-size: 1.6rem;
    color: #fff;
    opacity: 0;
    transition: opacity 150ms ease;
    cursor: pointer;

    &:hover {
        background: rgb(0 0 0 / 70%);
    }
}

.itemInfo {
    display: flex;
    padding: 1rem;
    flex-direction: column;
    gap: 0.4rem;
}

.categoryBadge {
    align-self: flex-start;
    padding: 0.2rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    text-transform: capitalize;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}

.filename {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.filesize {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
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

.footerLeft,
.footerRight {
    display: flex;
    gap: 1.2rem;
}

.footerLeft {
    align-items: center;
}

.metaField,
.categorySelector {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.metaInput,
.categorySelect {
    padding: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    font-size: 1.4rem;
    color: var(--bricks-base-800);
}

.metaInput {
    min-width: 18rem;

    &:focus {
        border-color: var(--bricks-primary-400);
        outline: none;
    }
}

.categorySelect {
    min-width: 16rem;
}

.previewOverlay {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    background: rgb(0 0 0 / 85%);
}

.previewClose {
    position: absolute;
    top: 2rem;
    right: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    padding: 0;
    border-radius: 0.8rem;
    border: none;
    background: rgb(255 255 255 / 15%);
    font-size: 2rem;
    color: #fff;
    transition: background 150ms ease;
    cursor: pointer;

    &:hover {
        background: rgb(255 255 255 / 25%);
    }
}

.previewImage {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0.4rem;
    object-fit: contain;
}
</style>
