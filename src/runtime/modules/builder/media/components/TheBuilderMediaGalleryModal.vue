<script setup lang="ts">
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
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksSearchInput from '../../../ui/inputs/BricksSearchInput.vue';
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
 * Параметры загрузки живут в модалке, а не в сторе: они относятся к сессии работы
 * с галереей, а не к самой медиатеке, и при новом открытии обязаны вернуться к
 * дефолтам конфига. Инициализируются общими дефолтами и накрываются дефолтами
 * конфига сразу после `useMediaUpload` — раньше конфиг взять негде, а объявить
 * ref позже нельзя: композабл читает его в колбэке.
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
const selectedItem = computed(
    () => mediaItems.value.find((item) => item.id === selectedItemId.value) ?? null
);
/**
 * Счётчики табов считаются по уже загруженному списку — отдельного запроса нет.
 * Файлы без категории ни в один счётчик не попадают: их видно только во «Всех».
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
 * Сводка медиатеки в шапке: она про всю библиотеку, поэтому стоит рядом с
 * кнопкой загрузки — тем единственным, что её меняет, — а не в футере, который
 * занят выбранным файлом.
 */
const librarySummary = computed<string>(() =>
    t('bricks.media.librarySummaryShort', {
        count: mediaItems.value.length,
        size: formatFileSize(totalSize.value),
    })
);

/**
 * Действия над категориями. Ниже Computed, а не в Data: композабл читает
 * `categoryCounts` для текста подтверждения, а обращение к нему выше объявления
 * ломало бы порядок, даже будучи отложенным замыканием.
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
 * Отфильтрованный список сетки: категория из дорожки, затем строка поиска.
 *
 * Ниже `useMediaCategoryActions`, потому что поиск сверяет ПОДПИСЬ категории, а
 * список подписей приходит оттуда. Сверка с `item.category` не годилась: там
 * лежит slug, то есть по «Фоны» не находилось ничего — в данных `fony`.
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
 * Загружает медиа и категории с обработкой ошибок.
 *
 * Параллельно: списки независимы, а последовательный запуск удваивал бы задержку
 * открытия галереи.
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

    // Отказ категорий не отменяет галерею: файлы видны и без ряда чипов, поэтому
    // это тост, а не ошибка уровня всей модалки
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
 * Показывает toast-уведомление об ошибке.
 */
function showErrorToast(message: string): void {
    toastMessage.value = message;
    toastVisible.value = true;
}

/**
 * Возвращает категорию для загрузки на основе активного фильтра.
 *
 * Приёмника для загрузки «из общего списка» больше нет: при фильтре «Все» файл
 * сохраняется без категории и виден только там же, во «Всех».
 *
 * @returns Категория сохраняемого файла или null.
 */
function resolveUploadCategory(): string | null {
    return categoryFilter.value !== ALL_MEDIA_CATEGORIES_FILTER ? categoryFilter.value : null;
}

/**
 * Загружает файлы из upload-зоны.
 *
 * Проверка права — не дубль скрытых контролов: приёмник файлов ловит перетаскивание
 * на всю сетку, и он остался бы рабочим входом в загрузку у роли, для которой
 * кнопки уже убраны.
 */
async function handleUpload(files: File[]): Promise<void> {
    if (!canEdit.value) {
        return;
    }

    await uploadFiles(files);
}

/**
 * Открывает системный выбор файлов из плитки-приёмника: сам input живёт в
 * контролах шапки, второй такой же в сетке означал бы две точки правды о том,
 * какие типы файлов принимаются.
 */
function handleUploadRequest(): void {
    if (!canEdit.value) {
        return;
    }

    uploadControlsRef.value?.openFilePicker();
}

/** Принимает изменённые параметры оптимизации из поповера. */
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
 * Сбрасывает фильтр и поиск. Нужен пустому результату: без него выход из него —
 * это найти и нажать активный чип, а при выбранной категории вместе с введённым
 * запросом требуется два действия.
 */
function handleResetFilter(): void {
    categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
    searchQuery.value = '';
}

/** Сохраняет изменённые метаданные выбранного элемента; отказ — toast. */
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
 * Обновляет категорию выбранного элемента; отказ — toast. null снимает
 * категорию с файла.
 *
 * Отказ обязателен к обработке здесь: без ожидания реджект стора ушёл бы в
 * необслуженный промис.
 *
 * @param category - Новая категория файла или null.
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
 * Снимает фильтр, указывающий на удалённую категорию: иначе он ссылался бы на
 * то, чего больше нет, и сетка осталась бы демонстративно пустой.
 *
 * @param slug - Удалённая категория.
 */
function handleCategoryDeleted(slug: string): void {
    if (categoryFilter.value === slug) {
        categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
    }
}

/** Открывает модалку подтверждения удаления. */
function handleRemoveItem(): void {
    if (!selectedItemId.value) {
        return;
    }
    isDeleteConfirmOpen.value = true;
}

/**
 * Подтверждает удаление выбранного элемента.
 *
 * Определённый отказ сервера оставляет подтверждение открытым — элемент на
 * месте, повтор безопасен и находится под рукой. Обрыв по потолку ожидания
 * закрывает его: исход неизвестен, файл мог быть удалён, и повтор получил бы
 * 404 — сообщение об этом прямо просит сначала обновить данные, а список стор
 * уже перечитывает сам.
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
// Монтирование совпадает с первым открытием: вызывающие держат латч и до него
// компонент не создают. Поэтому первый показ грузит данные отсюда — `visible`
// уже `true` на момент монтирования, и watch ниже на нём не срабатывает; ему
// остаются повторные открытия.
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

        // Подтверждения рендерятся вне `BricksModal` галереи, то есть её закрытие
        // их не снимает: диалог оставался висеть поверх приложения — в том числе
        // поверх уже другой сессии билдера, когда галерею гасит сброс сессии.
        // Лайтбокс живёт внутри модалки и размонтируется сам, но его
        // `previewItem` иначе всплывал бы при следующем открытии галереи
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
            <!-- Header -->
            <div :class="$style.header">
                <div :class="$style.titleGroup">
                    <h2 :class="$style.title">{{ t('bricks.media.galleryTitle') }}</h2>
                    <p :class="$style.summary">
                        {{ librarySummary }} · {{ t('bricks.media.dropAnywhereHint') }}
                    </p>
                </div>

                <div :class="$style.headerActions">
                    <BricksSearchInput
                        :class="$style.search"
                        :value="searchQuery"
                        :placeholder="t('bricks.media.searchPlaceholder')"
                        @update:value="searchQuery = $event"
                    />

                    <!-- Загрузка — запись: роли наблюдателя ручка откажет -->
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

                    <BricksCloseButton @click="handleClose" />
                </div>
            </div>

            <!-- Content -->
            <div :class="[$style.content, 'bricks-scrollbox']">
                <BuilderMediaGalleryFilters
                    v-model:category-filter="categoryFilter"
                    :categories="categories"
                    :category-counts="categoryCounts"
                    :total-count="mediaItems.length"
                    :is-creating-category="isCreatingCategory"
                    @create-category="handleCreateCategory"
                    @delete-category="handleRequestCategoryDelete"
                />

                <!--
                    Смена содержимого — с растворением: переключение категории
                    подменяло сетку мгновенно, и по неподвижной раскладке
                    (шесть плиток до и шесть после) было не видно, что список
                    вообще обновился.

                    Ключ — только категория, без поискового запроса: на нём
                    перебор шёл бы по букве и сетка мигала бы на каждом
                    нажатии. Переходы между сеткой и пустыми состояниями
                    отрабатывают сами — это разные ветки `v-if`.
                -->
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

                        <!-- Фильтр ничего не нашёл -->
                        <div v-else-if="hasItems" :class="$style.emptyState">
                            <BricksIcon :class="$style.emptyIcon" icon="ta:outline-filter" />
                            <p :class="$style.emptyText">{{ t('bricks.media.emptyFiltered') }}</p>
                            <BricksButton size="sm" variant="ghost" @click="handleResetFilter">
                                {{ t('bricks.media.resetFilter') }}
                            </BricksButton>
                        </div>

                        <!-- Медиатека пуста -->
                        <div v-else :class="$style.emptyState">
                            <BricksIcon :class="$style.emptyIcon" icon="ta:outline-photo" />
                            <p :class="$style.emptyText">{{ t('bricks.media.emptyNoUploads') }}</p>
                            <p :class="$style.emptyHint">
                                {{ t('bricks.media.emptyNoUploadsHint') }}
                            </p>
                        </div>
                    </Transition>

                    <!--
                        Приёмник накрывает только сетку: строка фильтров обязана
                        остаться видимой — по ней понятно, в какую категорию
                        уйдут файлы.
                    -->
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

            <!-- Footer -->
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

        <!-- Fullscreen Preview Lightbox -->
        <BuilderMediaGalleryPreviewLightbox :item="previewItem" @close="handleClosePreview" />
    </BricksModal>

    <!-- Upload Error Toast -->
    <BricksToast v-model:visible="toastVisible" :message="toastMessage" variant="error" />

    <!-- Delete Confirmation Modal -->
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

    <!-- Category Delete Confirmation -->
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

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.6rem;
    padding: 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.titleGroup {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.title {
    margin: 0;
    font-size: 2rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

/* Сводка медиатеки и подсказка о перетаскивании одной строкой: подсказка
   обязана быть видна всегда — постоянной зоны загрузки, которая раньше о себе
   сообщала, в модалке больше нет. */
.summary {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.headerActions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.8rem;
}

.search {
    width: 28rem;
}

/* Позиционирующий контейнер приёмника: он накрывает сетку целиком, поэтому
   растягивается по её месту, а не по всему содержимому модалки. */
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
    padding: 2rem;
}

.emptyState {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    flex-direction: column;
    gap: 1.2rem;
}

.emptyText {
    margin: 0;
    font-size: 1.6rem;
    color: var(--bricks-base-600);
}

.emptyHint {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.emptyIcon {
    font-size: 8rem;
    color: var(--bricks-base-300);
}

/* Футер двумя рядами: паддинг 1.6/2, высота приходит от содержимого — 120 с
   выбранным файлом и 76 без него. */
.footer {
    display: flex;
    align-items: center;
    padding: 1.6rem 2rem;
    border-top: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
}
</style>
