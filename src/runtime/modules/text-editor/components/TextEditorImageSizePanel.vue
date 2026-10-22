<script setup lang="ts">
// #region Imports
// Types
import type { ITextEditorImageSizePanelProps } from '../types/components';

// Utils
import {
    SIZE_UNITS,
    DEFAULT_PX_PER_EM,
    parseCustomDimension,
    convertToPx,
    convertFromPx,
    roundDecimal,
    type TSizeUnit,
} from '../utils/sizeUnits';
import { findSelectedMediaNode } from '../utils/selectedMediaNode';

// Vue
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksTooltip from '../../ui/base/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../ui/base/tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITextEditorImageSizePanelProps>(), {});
// #endregion

// #region Data
const { t } = useI18n();
const sizeWidth = ref('');
const sizeHeight = ref('');
const sizeUnit = ref<TSizeUnit>('rem');
const lockAspectRatio = ref(true);
// #endregion

// #region Computed
/**
 * Whether the height is driven by the aspect ratio rather than by the field.
 *
 * A percentage height resolves against the height of the containing block, which is
 * `auto` in a flow of text — the browser drops it. The node view answers a width alone
 * by computing the height from the aspect ratio, so the field would be offering a
 * number that is deliberately thrown away.
 */
const isHeightDerived = computed<boolean>(() => sizeUnit.value === '%');
// #endregion

// #region Methods
/** Reads the current sizes out of the attributes of the selected node */
function readCurrentSize(): void {
    if (!props.editor || !props.activeNodeType) {
        return;
    }

    const attrs = props.editor.getAttributes(props.activeNodeType);

    if (attrs.customWidth || attrs.customHeight) {
        const wParsed = attrs.customWidth ? parseCustomDimension(attrs.customWidth) : null;
        const hParsed = attrs.customHeight ? parseCustomDimension(attrs.customHeight) : null;

        sizeWidth.value = wParsed ? String(wParsed.value) : '';
        sizeHeight.value = hParsed ? String(hParsed.value) : '';
        sizeUnit.value = (wParsed?.unit || hParsed?.unit || 'rem') as TSizeUnit;
    } else {
        sizeWidth.value = attrs.width ? String(attrs.width) : '';
        sizeHeight.value = attrs.height ? String(attrs.height) : '';
        sizeUnit.value = 'px';
    }
}

/**
 * Returns the real px equivalent of 1em for the media element currently selected.
 * Takes the computed font-size of the element rather than a constant.
 */
function getEmPixelSize(): number {
    if (!props.editor || !props.activeNodeType) {
        return DEFAULT_PX_PER_EM;
    }

    const media = findSelectedMediaNode(props.editor);
    if (!media) {
        return DEFAULT_PX_PER_EM;
    }

    return parseFloat(getComputedStyle(media.element).fontSize) || DEFAULT_PX_PER_EM;
}

/**
 * Returns the width in pixels a percentage size of the selected media resolves against.
 *
 * The custom size lands on the container of the node view, so the base is the width of
 * ITS parent — the block the media sits in. The search starts from the selected node
 * rather than from the surface, because the shell of the editor differs between the
 * sidebar and the modal; the content element of the editor is the fallback, and 0 says
 * the base could not be read at all.
 */
function getPercentBasePx(): number {
    if (!props.editor) {
        return 0;
    }

    const media = findSelectedMediaNode(props.editor);
    const container = media?.element.closest('[data-resize-container]');
    const base = container?.parentElement ?? props.editor.view.dom;

    return base instanceof HTMLElement ? base.clientWidth : 0;
}

/** Returns the current aspect ratio (width/height) of the selected media */
function getCurrentAspectRatio(): number | null {
    if (!props.editor || !props.activeNodeType) {
        return null;
    }
    const attrs = props.editor.getAttributes(props.activeNodeType);
    if (!attrs.width || !attrs.height) {
        return null;
    }
    return attrs.width / attrs.height;
}

/** Applies the current size values to the attributes of the node */
function applySize(): void {
    if (!props.editor || !props.activeNodeType) {
        return;
    }

    const w = parseFloat(sizeWidth.value);
    const h = parseFloat(sizeHeight.value);
    const unit = sizeUnit.value;
    const attrs: Record<string, unknown> = {};

    if (unit === '%') {
        // The height is left to the aspect ratio on purpose: a percentage height is
        // dropped by the layout, and written into the attribute it would only travel
        // into the published page as a rule that does nothing. The pixel width/height
        // are kept untouched — the node view reads the ratio out of them
        attrs.customWidth = !isNaN(w) && w > 0 ? `${Math.min(w, 100)}%` : null;
        attrs.customHeight = null;
    } else if (unit === 'px') {
        attrs.customWidth = null;
        attrs.customHeight = null;
        if (!isNaN(w) && w > 0) {
            attrs.width = Math.round(w);
        }
        if (!isNaN(h) && h > 0) {
            attrs.height = Math.round(h);
        }
    } else {
        if (!isNaN(w) && w > 0) {
            attrs.customWidth = `${w}${unit}`;
            const pxEquiv = convertToPx(w, unit, getEmPixelSize());
            if (pxEquiv > 0) {
                attrs.width = pxEquiv;
            }
        } else {
            attrs.customWidth = null;
        }

        if (!isNaN(h) && h > 0) {
            attrs.customHeight = `${h}${unit}`;
            const pxEquiv = convertToPx(h, unit, getEmPixelSize());
            if (pxEquiv > 0) {
                attrs.height = pxEquiv;
            }
        } else {
            attrs.customHeight = null;
        }
    }

    // Remember the position of the node — inside, updateAttributes calls setNodeMarkup,
    // which replaces the node and turns the NodeSelection into a TextSelection.
    // Once the update is through, the NodeSelection is restored at the same position.
    const nodePos = props.editor.state.selection.from;

    props.editor
        .chain()
        .command(({ tr }) => {
            tr.setMeta('customSize', true);
            return true;
        })
        .updateAttributes(props.activeNodeType, attrs)
        .setNodeSelection(nodePos)
        .run();
}

/** Applies the width and recomputes the height while the aspect ratio is locked */
function applyWidth(): void {
    const w = parseFloat(sizeWidth.value);
    if (isNaN(w) || w <= 0) {
        return;
    }

    if (lockAspectRatio.value && !isHeightDerived.value) {
        const ratio = getCurrentAspectRatio();
        if (ratio) {
            sizeHeight.value = String(roundDecimal(w / ratio, 2));
        }
    }

    applySize();
}

/** Applies the height and recomputes the width while the aspect ratio is locked */
function applyHeight(): void {
    const h = parseFloat(sizeHeight.value);
    if (isNaN(h) || h <= 0) {
        return;
    }

    if (lockAspectRatio.value) {
        const ratio = getCurrentAspectRatio();
        if (ratio) {
            sizeWidth.value = String(roundDecimal(h * ratio, 2));
        }
    }

    applySize();
}

/**
 * Cycles the unit of measure and converts the values.
 * Converts from the pixel attrs (the source of truth) so that rounding errors do not
 * pile up.
 *
 * Switching into percent empties the height field instead of converting it: the height
 * follows the aspect ratio there, and a number in the field would be a promise the
 * layout does not keep.
 */
function cycleUnit(): void {
    const currentIndex = SIZE_UNITS.indexOf(sizeUnit.value);
    const newUnit = SIZE_UNITS[(currentIndex + 1) % SIZE_UNITS.length];

    // Take the pixel values from the attrs — those are always current
    if (props.editor && props.activeNodeType) {
        const attrs = props.editor.getAttributes(props.activeNodeType);
        const pxW = Number(attrs.width);
        const pxH = Number(attrs.height);
        const emPixelSize = getEmPixelSize();
        const percentBasePx = newUnit === '%' ? getPercentBasePx() : 0;

        if (pxW > 0) {
            sizeWidth.value = String(
                roundDecimal(convertFromPx(pxW, newUnit, emPixelSize, percentBasePx), 2)
            );
        }

        if (newUnit === '%') {
            sizeHeight.value = '';
        } else if (pxH > 0) {
            sizeHeight.value = String(roundDecimal(convertFromPx(pxH, newUnit, emPixelSize), 2));
        }
    }

    sizeUnit.value = newUnit;
    applySize();
}

/** Handles input in a size field (sanitization) */
function handleSizeInput(event: Event, dimension: 'width' | 'height'): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
        return;
    }

    const sanitized = target.value.replace(/[^\d.]/g, '');

    if (dimension === 'width') {
        sizeWidth.value = sanitized;
    } else {
        sizeHeight.value = sanitized;
    }

    if (target.value !== sanitized) {
        target.value = sanitized;
    }
}
// #endregion

// #region Lifecycle
onMounted(() => {
    readCurrentSize();
});
// #endregion
</script>

<template>
    <div :class="$style.TextEditorImageSizePanel" @mousedown.stop @click.stop>
        <div :class="$style.sizeRow">
            <span :class="$style.sizeLabel">W</span>
            <input
                :class="$style.sizeInput"
                type="text"
                inputmode="decimal"
                :value="sizeWidth"
                @input="handleSizeInput($event, 'width')"
                @blur="applyWidth"
                @keydown.enter.stop.prevent="applyWidth"
            />
        </div>

        <div :class="$style.sizeMeta">
            <BricksTooltip top>
                <template #activator>
                    <button
                        type="button"
                        :class="[$style.lockButton, { [$style._locked]: lockAspectRatio }]"
                        @mousedown.prevent="lockAspectRatio = !lockAspectRatio"
                    >
                        <BricksIcon :icon="lockAspectRatio ? 'ph:link' : 'ph:link-break'" />
                    </button>
                </template>
                <BricksTooltipHint
                    :text="
                        lockAspectRatio
                            ? t('bricks.textEditor.aspectLocked')
                            : t('bricks.textEditor.aspectFree')
                    "
                />
            </BricksTooltip>

            <button type="button" :class="$style.unitButton" @mousedown.prevent="cycleUnit">
                {{ sizeUnit }}
            </button>
        </div>

        <div :class="$style.sizeRow">
            <span :class="$style.sizeLabel">H</span>
            <input
                :class="$style.sizeInput"
                type="text"
                inputmode="decimal"
                :value="sizeHeight"
                :disabled="isHeightDerived"
                @input="handleSizeInput($event, 'height')"
                @blur="applyHeight"
                @keydown.enter.stop.prevent="applyHeight"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.TextEditorImageSizePanel {
    position: absolute;
    top: calc(100% + 0.4rem);
    right: 0;
    z-index: 1;
    display: flex;
    padding: 0.8rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    flex-direction: column;
    gap: 0.4rem;
    box-shadow: var(--bricks-shadow-sm);
}

.sizeRow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.sizeLabel {
    width: 1.6rem;
    text-align: center;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-base-500);
    user-select: none;
}

.sizeInput {
    width: 7rem;
    padding: 0.4rem 0.6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    outline: none;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-base-900);

    &:focus {
        border-color: var(--bricks-primary);
    }

    &:disabled {
        background: var(--bricks-base-50);
        color: var(--bricks-base-400);
        cursor: not-allowed;
    }
}

.sizeMeta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0 0 0 2rem;
}

.lockButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    color: var(--bricks-base-400);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }

    &:hover {
        background-color: var(--bricks-base-100);
        color: var(--bricks-base-600);
    }

    &._locked {
        color: var(--bricks-primary);
    }
}

.unitButton {
    padding: 0.2rem 0.6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        background: var(--bricks-base-100);
    }
}
</style>
