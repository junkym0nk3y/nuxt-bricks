<script setup lang="ts">
// #region Imports
// Types
import type { IGalleryItem } from '../../../common/types/content';
import type { IBrickGalleryFieldsConfig } from '../../../common/types/index';

// Vue
import { computed, useCssModule } from 'vue';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksTagsEditor from '../../../ui/inputs/BricksTagsEditor.vue';
// #endregion

// #region Interfaces
interface IPropertyImageGalleryEditorProps {
    modelValue?: IGalleryItem[];
    label?: string;
    /** Конфигурация дополнительных полей (title, tags) */
    fields?: IBrickGalleryFieldsConfig;
}

interface IPropertyImageGalleryEditorEmits {
    'update:modelValue': [value: IGalleryItem[]];
    openGallery: [
        {
            action: 'append' | 'replace';
            itemIndex?: number;
            insertIndex?: number;
        },
    ];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IPropertyImageGalleryEditorProps>(), {
    modelValue: () => [],
    label: 'Галерея изображений',
    fields: () => ({}),
});
// #endregion

// #region Emits
const emit = defineEmits<IPropertyImageGalleryEditorEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const items = computed<IGalleryItem[]>(() => props.modelValue || []);
const hasItems = computed<boolean>(() => items.value.length > 0);

/** Показывать поле title (по умолчанию true) */
const showTitle = computed<boolean>(() => props.fields?.title !== false);
/** Показывать поле caption (по умолчанию false) */
const showCaption = computed<boolean>(() => props.fields?.caption === true);
/** Показывать редактор тегов (по умолчанию false) */
const showTags = computed<boolean>(() => props.fields?.tags === true);
// #endregion

// #region Methods
/**
 * Клонирует массив элементов галереи.
 */
function cloneItems(source: IGalleryItem[]): IGalleryItem[] {
    return source.map((item) => ({ ...item }));
}

/**
 * Эмитит новое значение галереи.
 */
function updateItems(value: IGalleryItem[]): void {
    emit('update:modelValue', value);
}

/**
 * Открывает медиа-галерею для добавления нового изображения.
 */
function handleAddImage(): void {
    emit('openGallery', {
        action: 'append',
        insertIndex: items.value.length,
    });
}

/**
 * Обновляет title элемента.
 */
function handleTitleChange(index: number, value: string): void {
    const next = cloneItems(items.value);
    if (!next[index]) {
        return;
    }

    next[index] = { ...next[index], title: value };
    updateItems(next);
}

/**
 * Обновляет caption элемента.
 */
function handleCaptionChange(index: number, value: string): void {
    const next = cloneItems(items.value);
    if (!next[index]) {
        return;
    }

    next[index] = { ...next[index], caption: value };
    updateItems(next);
}

/**
 * Проверяет, является ли элемент видео по mimeType.
 */
function isVideoItem(item: IGalleryItem): boolean {
    return Boolean(item.mimeType?.startsWith('video/'));
}

/**
 * Обновляет теги элемента.
 */
function handleTagsChange(index: number, value: string[]): void {
    const next = cloneItems(items.value);
    if (!next[index]) {
        return;
    }

    next[index] = { ...next[index], tags: value };
    updateItems(next);
}

/**
 * Удаляет элемент из галереи.
 */
function handleRemoveItem(index: number): void {
    const next = cloneItems(items.value);
    next.splice(index, 1);
    updateItems(next);
}

/**
 * Перемещает элемент вверх.
 */
function handleMoveUp(index: number): void {
    if (index === 0) {
        return;
    }

    const next = cloneItems(items.value);
    const [item] = next.splice(index, 1);
    next.splice(index - 1, 0, item);
    updateItems(next);
}

/**
 * Перемещает элемент вниз.
 */
function handleMoveDown(index: number): void {
    if (index >= items.value.length - 1) {
        return;
    }

    const next = cloneItems(items.value);
    const [item] = next.splice(index, 1);
    next.splice(index + 1, 0, item);
    updateItems(next);
}

/**
 * Заменяет изображение элемента.
 */
function handleReplaceImage(index: number): void {
    emit('openGallery', {
        action: 'replace',
        itemIndex: index,
    });
}
// #endregion
</script>

<template>
    <div :class="$style.PropertyImageGalleryEditor">
        <div :class="$style.header">
            <span :class="$style.title">{{ props.label }}</span>
            <BricksButton size="sm" variant="primary" @click="handleAddImage">
                <BricksIcon icon="ph:plus" />
                Добавить
            </BricksButton>
        </div>

        <div v-if="hasItems" :class="$style.grid">
            <div
                v-for="(item, index) in items"
                :key="item.id || `gallery_${index}`"
                :class="$style.card"
            >
                <div :class="$style.imageWrapper" @click="handleReplaceImage(index)">
                    <div v-if="isVideoItem(item)" :class="$style.videoPlaceholder">
                        <BricksIcon icon="md:sharp-video-library" />
                    </div>
                    <img
                        v-else-if="item.url"
                        :src="item.url"
                        :alt="item.title || ''"
                        :class="$style.image"
                    />
                    <div v-else :class="$style.placeholder">
                        <BricksIcon icon="md:image-plus" />
                    </div>
                    <div :class="$style.imageOverlay">
                        <BricksIcon icon="ph:pencil" />
                    </div>
                </div>

                <div :class="$style.cardBody">
                    <BricksInput
                        v-if="showTitle"
                        :value="item.title || ''"
                        placeholder="Title"
                        size="small"
                        @update:value="handleTitleChange(index, $event as string)"
                    />

                    <BricksInput
                        v-if="showCaption"
                        :value="item.caption || ''"
                        placeholder="Caption"
                        size="small"
                        @update:value="handleCaptionChange(index, $event as string)"
                    />

                    <BricksTagsEditor
                        v-if="showTags"
                        :model-value="item.tags || []"
                        placeholder="Добавить тег..."
                        @update:model-value="handleTagsChange(index, $event)"
                    />

                    <div :class="$style.actions">
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            :disabled="index === 0"
                            @click="handleMoveUp(index)"
                        >
                            <BricksIcon icon="md:arrow-up" />
                        </BricksButton>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            :disabled="index === items.length - 1"
                            @click="handleMoveDown(index)"
                        >
                            <BricksIcon icon="md:arrow-down" />
                        </BricksButton>
                        <BricksButton size="sm" variant="ghost" @click="handleRemoveItem(index)">
                            <BricksIcon icon="md:delete-outline" />
                        </BricksButton>
                    </div>
                </div>
            </div>
        </div>

        <div v-else :class="$style.empty" @click="handleAddImage">
            <BricksIcon :class="$style.emptyIcon" icon="md:image-multiple" />
            <span>Нажмите, чтобы добавить изображение</span>
        </div>
    </div>
</template>

<style module lang="scss">
.PropertyImageGalleryEditor {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}

.title {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-800);
}

.grid {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.card {
    display: flex;
    gap: 1.2rem;
    padding: 1rem;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.imageWrapper {
    --bricks-base-100: #f3f4f6;

    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    width: 8rem;
    height: 8rem;
    border-radius: 0.6rem;
    background: var(--bricks-base-100);
    cursor: pointer;

    &:hover .imageOverlay {
        opacity: 1;
    }
}

.image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 2.4rem;
    color: var(--bricks-base-400);
}

.videoPlaceholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--bricks-base-100, #f3f4f6);
    font-size: 2.4rem;
    color: var(--bricks-base-400);
}

.imageOverlay {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 50%);
    font-size: 2rem;
    color: var(--bricks-base-0);
    opacity: 0;
    transition: opacity 0.2s;
    inset: 0;
}

.cardBody {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 0.8rem;
    min-width: 0;
}

.actions {
    display: flex;
    gap: 0.4rem;
    margin-top: auto;
}

.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2.4rem;
    border-radius: 0.8rem;
    border: 2px dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    font-size: 1.4rem;
    color: var(--bricks-base-500);
    transition:
        border-color 0.2s,
        background 0.2s;
    cursor: pointer;
    flex-direction: column;
    gap: 0.8rem;

    &:hover {
        border-color: var(--bricks-primary-400);
        background: var(--bricks-primary-50);
        color: var(--bricks-primary-600);
    }
}

.emptyIcon {
    font-size: 3.2rem;
}
</style>
