<script setup lang="ts">
// #region Imports
// Types
import type { IInlineContentSegment, IGalleryItem } from '../../../../common/types/content';
import type { IAccordionItem } from '../../../../layouts-blocks/types/blockProps';
import type {
    ISidebarPropertyEditorRowProps,
    TInlineGalleryPayload,
} from '../types/sidebarProperties';

// Vue
import { computed, type Component } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPropertyEditorRowProps>(), {
    showGroupLabel: false,
});
// #endregion

// #region Computed
const isBooleanEditor = computed<boolean>(() => props.type === 'boolean');
const isMediaEditor = computed<boolean>(() => props.type === 'image' || props.type === 'video');
const isInlineEditor = computed<boolean>(() => props.type === 'inline-content');
const isImageGalleryEditor = computed<boolean>(() => props.type === 'image-gallery');
const isAccordionItemsEditor = computed<boolean>(() => props.type === 'accordion-items');
const isColorEditor = computed<boolean>(() => props.type === 'color');
const shouldShowLabel = computed<boolean>(() => {
    if (!props.variant?.label || props.variant?.property?.description) {
        return false;
    }
    return !isBooleanEditor.value && !isMediaEditor.value;
});
const resolvedEditorComponent = computed<Component>(() => {
    return props.componentEditors[props.type] || props.componentEditors.input;
});
const resolvedEditorProps = computed<Record<string, unknown>>(() => {
    if (isMediaEditor.value) {
        return { label: props.variant.label, type: props.type };
    }

    const normalized = props.handleNormalizeProps(props.variant, props.type);
    if (props.type === 'input') {
        return {
            ...normalized,
            label: '',
        };
    }

    return normalized;
});
const resolvedInputType = computed<string | undefined>(() => {
    if (props.type !== 'input') {
        return undefined;
    }
    return props.variant.property.type === 'number' ? 'number' : 'text';
});
// #endregion

// #region Methods
/**
 * Оборачивает emit изменения значения inline редактора.
 *
 * @param value - Массив сегментов inline контента.
 */
function handleInlineChange(value: IInlineContentSegment[]): void {
    props.handleChangeValues(props.variant.property, value as unknown as Array<unknown>);
}

/**
 * Обёртка для update:value/model-value стандартных редакторов.
 *
 * @param value - Новое значение свойства.
 */
function handleValueChange(
    value: string | number | boolean | Record<string, unknown> | Array<unknown>
): void {
    props.handleChangeValues(props.variant.property, value);
}

/**
 * Делегирует открытие медиагалереи родительскому composable.
 *
 * @param payload - Параметры inline-редактора.
 */
function handleOpenGallery(payload?: TInlineGalleryPayload): void {
    props.handleOpenMediaGallery(props.variant.property, payload);
}

/**
 * Враппер для inline-редакторов — пробрасывает payload в composable.
 *
 * @param payload - Данные для вставки/замены сегмента.
 */
function handleInlineGallery(payload?: TInlineGalleryPayload): void {
    handleOpenGallery(payload);
}

/**
 * Оборачивает emit изменения значения image-gallery редактора.
 *
 * @param value - Массив элементов галереи.
 */
function handleImageGalleryChange(value: IGalleryItem[]): void {
    props.handleChangeValues(props.variant.property, value as unknown as Array<unknown>);
}

/**
 * Враппер для image-gallery редактора — пробрасывает payload в composable.
 *
 * @param payload - Данные для вставки/замены элемента галереи.
 */
function handleImageGalleryOpen(payload?: TInlineGalleryPayload): void {
    handleOpenGallery(payload);
}

/**
 * Открывает галерею для медиа-редакторов (image/video).
 */
function handleMediaOpen(): void {
    if (!isMediaEditor.value) {
        return;
    }

    handleOpenGallery();
}

/**
 * Оборачивает emit изменения значения accordion-items редактора.
 *
 * @param value - Массив элементов аккордеона.
 */
function handleAccordionItemsChange(value: IAccordionItem[]): void {
    props.handleChangeValues(props.variant.property, value as unknown as Array<unknown>);
}
// #endregion
</script>

<template>
    <div :class="[$style.BuilderShellSidebarPropertyEditorRow, { [$style._bool]: isBooleanEditor }]">
        <span v-if="shouldShowLabel" :class="$style.fieldLabel"> {{ props.variant.label }}: </span>
        <span v-if="props.variant.property.description" :class="$style.fieldDescription">
            {{ props.variant.property.description }}
        </span>

        <template v-if="isInlineEditor">
            <component
                :is="resolvedEditorComponent"
                :label="props.variant.label"
                :model-value="(props.variant.value as IInlineContentSegment[]) || []"
                @update:model-value="handleInlineChange"
                @open-gallery="handleInlineGallery"
            />
        </template>
        <template v-else-if="isImageGalleryEditor">
            <component
                :is="resolvedEditorComponent"
                :label="props.variant.label"
                :model-value="(props.variant.value as IGalleryItem[]) || []"
                :fields="props.variant.property.fields"
                @update:model-value="handleImageGalleryChange"
                @open-gallery="handleImageGalleryOpen"
            />
        </template>
        <template v-else-if="isColorEditor">
            <component
                :is="resolvedEditorComponent"
                :value="(props.variant.value as string) || ''"
                @update:value="handleValueChange"
            />
        </template>
        <template v-else-if="isAccordionItemsEditor">
            <component
                :is="resolvedEditorComponent"
                :label="props.variant.label"
                :model-value="(props.variant.value as IAccordionItem[]) || []"
                @update:model-value="handleAccordionItemsChange"
            />
        </template>
        <template v-else>
            <component
                :is="resolvedEditorComponent"
                v-bind="resolvedEditorProps"
                :type="resolvedInputType"
                :model-value="props.variant.value"
                @update:model-value="handleValueChange"
                @update:value="handleValueChange"
                @open-gallery="handleMediaOpen"
            />
        </template>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyEditorRow {
    display: flex;
    flex-direction: column;
    margin-bottom: 1.4rem;

    &:last-child {
        margin-bottom: 0;
    }

    &._bool {
        margin-bottom: 0.2rem;
    }
}

.groupLabel {
    margin-bottom: 0.4rem;
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-base-500);
}

.fieldLabel {
    margin-bottom: 0.8rem;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-900);
    user-select: none;
}

.fieldDescription {
    margin-top: -0.4rem;
    margin-bottom: 0.8rem;
    font-size: 1.4rem;
    font-weight: 400;
    line-height: 1.4;
    color: var(--bricks-base-600);
    user-select: none;
}
</style>
