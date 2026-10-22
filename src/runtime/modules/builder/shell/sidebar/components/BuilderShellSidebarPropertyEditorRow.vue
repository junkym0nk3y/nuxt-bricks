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
import { normalizeVariantProps } from '../utils/normalizeVariantProps';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPropertyEditorRowProps>(), {});
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

/**
 * Caption of the row: the description when there is one, the label otherwise.
 *
 * The gallery draws it in a header of its own. The label of a brick property is generated
 * out of its key ("Project1Images"), and the gallery used to show that one in its header
 * with the description of the author hanging above it as a line of its own. The separate
 * description line goes away for the gallery, so the text is not shown twice. Only the
 * gallery: the accordion items and the media pickers draw a header of their own as well,
 * but the descriptions of the built-in blocks there are hints ("Background image URL")
 * that would push out a better caption.
 *
 * A text or number field takes it as its accessible name. The row draws the caption as
 * plain text rather than as a label of the field, and the field had no name at all: a
 * screen reader read out its value alone.
 */
const rowCaption = computed<string>(() => resolvedDescription.value || props.variant.label);
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
        // `disabled` travels here by hand: the media editors take a shape of their own
        // rather than the normalized one, and without it a locked property would show
        // working buttons — the pick writes through the gallery, past the guard of the
        // change handler
        return {
            label: props.variant.label,
            type: props.type,
            disabled: props.variant.disabled,
        };
    }

    const normalized = normalizeVariantProps(props.variant);
    if (props.type === 'input') {
        return {
            ...normalized,
            label: '',
            ariaLabel: rowCaption.value,
        };
    }

    // The caption of the row is drawn by the row itself, and the text editor takes
    // no `label` prop — left in, `v-bind` would put it on the root element of the
    // editor as a stray DOM attribute
    if (props.type === 'textarea') {
        const withoutLabel = { ...normalized };
        delete withoutLabel.label;
        return withoutLabel;
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
        <span v-if="resolvedDescription && !isImageGalleryEditor" :class="$style.fieldDescription">
            {{ resolvedDescription }}
        </span>

        <template v-if="isImageGalleryEditor">
            <component
                :is="resolvedEditorComponent"
                :label="rowCaption"
                :model-value="(props.variant.value as IGalleryItem[]) || []"
                :fields="props.variant.property.fields"
                :disabled="props.variant.disabled"
                @update:model-value="handleImageGalleryChange"
                @open-gallery="handleImageGalleryOpen"
            />
        </template>
        <template v-else-if="isColorEditor">
            <component
                :is="resolvedEditorComponent"
                :value="(props.variant.value as string) || ''"
                :disabled="props.variant.disabled"
                @update:value="handleValueChange"
            />
        </template>
        <template v-else-if="isAccordionItemsEditor">
            <component
                :is="resolvedEditorComponent"
                :label="props.variant.label"
                :model-value="(props.variant.value as IAccordionItem[]) || []"
                :disabled="props.variant.disabled"
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
