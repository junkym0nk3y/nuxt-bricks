<script setup lang="ts">
/**
 * @description Тело раздела «Медиатека» на дашборде: дорожка категорий, сетка
 * файлов, пустые состояния и приёмник перетаскивания.
 *
 * Раздел, а не модалка: менеджер файлов — такой же отдел дашборда, как
 * «Страницы», «Шаблоны» и «Пользователи». Модалка осталась там, где выбор файла
 * — шаг внутри другой работы (сайдбар билдера, OG-изображение страницы).
 *
 * Компонент-контроллер по своей части: управление категориями и подтверждение их
 * удаления живут здесь. Загрузка и выбранный файл — нет: кнопка загрузки стоит в
 * шапке дашборда, панель деталей — в слоте оболочки, и оба состояния держит
 * `usePublishMediaSurface` в хосте.
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
 * Право записи решает не только судьбу кнопок: приёмник перетаскивания — такое
 * же приглашение загрузить файл, и у роли без права он разворачивал бы оверлей
 * «отпустите — к загрузке» на действие, которое молча отсекается гардом.
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
} = useMediaCategoryActions({
    resolveCategoryCount: (slug: string) => categoryCounts.value[slug] ?? 0,
    onCategoryDeleted: handleCategoryDeleted,
    onError: (message: string) => emit('notify', message, 'error'),
});

/**
 * Отфильтрованный список сетки: категория из дорожки, затем строка поиска.
 *
 * Ниже `useMediaCategoryActions`, потому что поиск сверяет ПОДПИСЬ категории, а
 * список подписей приходит оттуда. Сверка с `item.category` не годится: там
 * лежит slug, то есть по «Фоны» не нашлось бы ничего — в данных `fony`.
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
 * Сводка медиатеки в футере раздела: сколько файлов, сколько весят и подсказка о
 * перетаскивании. Она про всю библиотеку, а не про отфильтрованное, поэтому
 * считается по полному списку — иначе выбранная категория выглядела бы как
 * «медиатека уменьшилась».
 *
 * Подсказка обязана быть видна всегда: постоянной зоны загрузки в интерфейсе
 * нет, а приёмник показывается, только когда файлы уже над окном.
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

    // Подсказка своя, не модалочная: приёмник висит на теле раздела, а не на
    // всём окне — файл, брошенный на рейл или шапку, не принимается
    return `${summary} · ${t('bricks.media.dropSectionHint')}`;
});

/**
 * Подсказка пустого состояния: как положить сюда первый файл. У роли без права
 * записи её нет вовсе — оба названных входа ей закрыты, и приглашение звало бы
 * в тупик. Текст свой, не модалочный: приёмник ограничен телом раздела.
 */
const emptyStateHint = computed<string>(() =>
    canEdit.value ? t('bricks.media.emptyNoUploadsSectionHint') : ''
);

/**
 * Прочитан ли состав медиатеки. До первого удачного ответа «медиатека пуста»
 * показывать нельзя: список пуст и когда чтение не дошло, а такое сообщение
 * утверждает, что файлов нет.
 */
const hasLibrarySnapshot = computed<boolean>(() => mediaStore.hasLoadedItemsSnapshot);
// #endregion

// #region Methods
/**
 * Пробрасывает изменённые параметры загрузки наверх: ими владеет поверхность
 * хоста — по ним грузит файлы кнопка шапки.
 *
 * @param value - Новые параметры оптимизации.
 */
function handleOptimizationChange(value: IBricksMediaOptimization): void {
    emit('update:uploadOptimization', value);
}

/**
 * Пробрасывает смену категории наверх: ею владеет поверхность хоста — от неё
 * зависит категория загружаемых файлов, а кнопка загрузки стоит в шапке.
 *
 * @param value - Выбранная категория.
 */
function handleCategoryFilterChange(value: string): void {
    emit('update:categoryFilter', value);
}

/**
 * Снимает фильтр, указывающий на удалённую категорию: иначе он ссылался бы на
 * то, чего больше нет, и сетка осталась бы демонстративно пустой.
 *
 * @param slug - Удалённая категория.
 */
function handleCategoryDeleted(slug: string): void {
    if (props.categoryFilter === slug) {
        emit('update:categoryFilter', ALL_MEDIA_CATEGORIES_FILTER);
    }
}

/**
 * Просит хост открыть панель деталей файла.
 *
 * @param item - Выбранный файл.
 */
function handleSelectItem(item: IMediaItem): void {
    emit('select', item);
}

/**
 * Просит хост открыть файл во весь экран.
 *
 * @param item - Файл.
 */
function handlePreviewItem(item: IMediaItem): void {
    emit('preview', item);
}

/**
 * Плитка-приёмник просит открыть системный выбор файлов.
 */
function handleUploadRequest(): void {
    emit('request-upload');
}

/**
 * Пустой результат фильтра: сбрасываются разом категория и строка поиска —
 * поиском владеет шапка, категорией поверхность хоста.
 */
function handleResetFilter(): void {
    emit('reset-filters');
}

/**
 * Читает категории, если достоверного снимка ещё нет.
 *
 * Список файлов здесь не читается: его берёт хост — счётчик рейла рисуется до
 * открытия раздела. Категории же нужны только этому разделу, поэтому и читаются
 * при его первом показе, а не на старте дашборда.
 */
async function loadCategories(): Promise<void> {
    if (categoriesStore.hasLoadedCategoriesSnapshot) {
        return;
    }

    try {
        await categoriesStore.loadCategories();
    } catch (error: unknown) {
        // Отказ категорий не отменяет раздел: файлы видны и без ряда чипов
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
            <!--
                Параметры загрузки стоят здесь, а не в шапке: они про то, каким
                уедет файл, и место им рядом с дорожкой категорий — тем, что
                решает, КУДА он уедет. Гейт роли — у самой строки фильтров:
                хвост ряда рисуется только с правом правки
            -->
            <template #actions>
                <BuilderMediaGalleryUploadOptionsPopover
                    :optimization="props.uploadOptimization"
                    :configured-max-width="props.configuredMaxWidth"
                    tooltip-side="top"
                    @update:optimization="handleOptimizationChange"
                />
            </template>
        </BuilderMediaGalleryFilters>

        <!--
            Смена содержимого — с растворением: переключение категории подменяло
            сетку мгновенно, и по неподвижной раскладке было не видно, что список
            обновился. Ключ — только категория, без поискового запроса: на нём
            перебор шёл бы по букве и сетка мигала бы на каждом нажатии.
        -->
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

                <!-- Фильтр ничего не нашёл -->
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

                <!-- Медиатека пуста — только когда состав действительно прочитан -->
                <BricksEmptyState
                    v-else-if="hasLibrarySnapshot"
                    :class="$style.emptyState"
                    icon="ta:outline-photo"
                    :title="t('bricks.media.emptyNoUploads')"
                    :description="emptyStateHint"
                />
            </Transition>

            <!--
                Приёмник накрывает только сетку: дорожка категорий обязана
                остаться видимой — по ней понятно, в какую категорию уйдут файлы.
            -->
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

        <!--
            Футер раздела липнет к низу области списка: сводка и подсказка о
            перетаскивании относятся ко всей медиатеке, и уезжать вместе с
            сеткой им незачем. Фон обязателен — под полосой проходит контент
        -->
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
/* Раздел тянется на всю высоту области списка, иначе футер со сводкой вставал бы
   сразу под сеткой — то есть посреди экрана, пока файлов мало. */
.TheBuilderMediaSection {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 1.6rem;
    min-height: 100%;
}

/* Позиционирующий контейнер приёмника: он накрывает сетку целиком, поэтому
   растягивается по её месту, а не по всему телу раздела. */
.gridArea {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
}

/* Отступы состояния задаёт раздел: у сетки их нет. */
.emptyState {
    padding: 4rem 2rem;
}

/* Полоса-сводка внизу области списка. Отрицательные поля растягивают её на всю
   ширину области вместе с её паддингом, иначе линия обрывалась бы, не доходя до
   краёв. */
.summary {
    position: sticky;
    bottom: -2rem;
    margin: 0 -2.4rem -2rem;
    padding: 1.2rem 2.4rem;
    border-top: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}
</style>
