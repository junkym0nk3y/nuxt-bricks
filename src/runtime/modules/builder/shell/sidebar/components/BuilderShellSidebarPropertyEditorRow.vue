<script setup lang="ts">
// #region Imports
// Types
import type { IGalleryItem } from '../../../../common/types/content';
import type { TBrickPropValue } from '../../../../common/types/brick';
import type { IAccordionItem } from '../../../../layouts-blocks/types/blockProps';
import type {
    ISidebarPropertyEditorRowProps,
    TInlineGalleryPayload,
} from '../types/sidebarProperties';

// Vue
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPropertyEditorRowProps>(), {
    showGroupLabel: false,
});
// #endregion

// #region Data
const { t, te } = useI18n();
// #endregion

// #region Computed
const resolvedDescription = computed<string>(
    () => resolveBricksLabel(t, te, props.variant?.property?.description) || ''
);
const isBooleanEditor = computed<boolean>(() => props.type === 'boolean');
const isMediaEditor = computed<boolean>(() => props.type === 'image' || props.type === 'video');
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
 * Wrapper over `update:value` and `update:model-value` of the standard editors.
 *
 * @param value - New value of the property.
 */
function handleValueChange(value: TBrickPropValue): void {
    props.handleChangeValues(props.variant.property, value);
}

/**
 * Delegates the opening of the media gallery to the parent composable.
 *
 * @param payload - Parameters of the inline editor.
 */
function handleOpenGallery(payload?: TInlineGalleryPayload): void {
    props.handleOpenMediaGallery(props.variant.property, payload);
}

/**
 * Wraps the value-change emit of the image gallery editor.
 *
 * @param value - Array of the gallery items.
 */
function handleImageGalleryChange(value: IGalleryItem[]): void {
    props.handleChangeValues(props.variant.property, value);
}

/**
 * Wrapper for the image gallery editor: it forwards the payload to the composable.
 *
 * @param payload - Data of the gallery item to insert or replace.
 */
function handleImageGalleryOpen(payload?: TInlineGalleryPayload): void {
    handleOpenGallery(payload);
}

/**
 * Opens the gallery for the media editors (image and video).
 */
function handleMediaOpen(): void {
    if (!isMediaEditor.value) {
        return;
    }

    handleOpenGallery();
}

/**
 * Wraps the value-change emit of the accordion items editor.
 *
 * @param value - Array of the accordion items.
 */
function handleAccordionItemsChange(value: IAccordionItem[]): void {
    props.handleChangeValues(props.variant.property, value);
}
// #endregion
</script>

<template>
    <div
        :class="[$style.BuilderShellSidebarPropertyEditorRow, { [$style._bool]: isBooleanEditor }]"
    >
        <span v-if="shouldShowLabel" :class="$style.fieldLabel"> {{ props.variant.label }}: </span>
        <span v-if="resolvedDescription" :class="$style.fieldDescription">
            {{ resolvedDescription }}
        </span>

        <template v-if="isImageGalleryEditor">
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
    margin-bottom: 1.6rem;

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
