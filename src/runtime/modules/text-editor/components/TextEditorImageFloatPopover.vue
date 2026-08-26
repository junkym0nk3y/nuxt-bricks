<script setup lang="ts">
// #region Imports
// Types
import type { ITextEditorImageFloatPopoverProps } from './types';

// Utils
import { findSelectedMediaNode } from '../utils/selectedMediaNode';

// Vue
import { computed, ref, watchEffect, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksPopoverSurface from '../../ui/base/popover/BricksPopoverSurface.vue';
import BricksTooltip from '../../ui/base/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../ui/base/tooltip/BricksTooltipHint.vue';
import TextEditorImageSizePanel from './TextEditorImageSizePanel.vue';
// #endregion

// #region Props
const props = defineProps<ITextEditorImageFloatPopoverProps>();
// #endregion

// #region Data
const { t } = useI18n();

/**
 * Vertical alignment of a selected image or video.
 *
 * `baseline` is the one that clears the alignment (it is what the CSS default gives), so
 * it carries the same glyph as "no float" in the group above rather than an arrow. The
 * four values are exactly what the node extensions parse and render — `bottom` used to be
 * missing here, so markup carrying it could be read but never written.
 */
const VALIGN_OPTIONS = [
    { value: 'baseline', icon: 'ph:x', label: 'bricks.textEditor.alignBaseline' },
    { value: 'middle', icon: 'md:vertical-align-center', label: 'bricks.textEditor.alignMiddle' },
    { value: 'top', icon: 'md:vertical-align-top', label: 'bricks.textEditor.alignTop' },
    { value: 'bottom', icon: 'md:vertical-align-bottom', label: 'bricks.textEditor.alignBottom' },
] as const;

const isVisible = ref(false);
const popoverTop = ref(0);
const popoverLeft = ref(0);
const currentFloat = ref<string | null>(null);
const currentVerticalAlign = ref<string | null>(null);
const activeNodeType = ref<string | null>(null);
const showSizePanel = ref(false);
// #endregion

// #region Computed
/**
 * Whether the media carries no floating: either no attribute at all — that is what the
 * button writes — or the explicit `none` that only arrives with markup from outside.
 */
const isFloatCleared = computed<boolean>(
    () => currentFloat.value === null || currentFloat.value === 'none'
);
// #endregion

// #region Methods
/**
 * Anchors the popover to the top center of the selected element.
 *
 * The coordinates are the anchor point itself, not the corner of the popover: the shift
 * onto its own size (half the width to the left, the full height plus the gap upwards) is
 * left to the `transform` of the root class. Written out here, that shift needs the size
 * of the popover as a number — and the size is made up of eight buttons, two separators,
 * the gaps, the padding of the surface and its border, so every one of those had to be
 * repeated in JS. The width kept as a constant here said 270 px while the measured one is
 * 262, and the popover sat off center by half that difference.
 *
 * The coordinates stay in px on purpose: getBoundingClientRect answers in CSS pixels, and
 * putting them through the rem base of the project would only add a scale error.
 */
function updatePosition(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    popoverTop.value = rect.top;
    popoverLeft.value = rect.left + rect.width / 2;
}

/** Sets the float attribute on the media element */
function setFloat(value: string | null): void {
    if (!props.editor || !activeNodeType.value) {
        return;
    }

    props.editor.chain().focus().updateAttributes(activeNodeType.value, { float: value }).run();
}

/** Sets the vertical-align attribute on the media element */
function setVerticalAlign(value: string | null): void {
    if (!props.editor || !activeNodeType.value) {
        return;
    }

    props.editor
        .chain()
        .focus()
        .updateAttributes(activeNodeType.value, { verticalAlign: value })
        .run();
}

/** Opens or closes the size panel (the panel reads the sizes when it mounts) */
function toggleSizePanel(): void {
    showSizePanel.value = !showSizePanel.value;
}
// #endregion

// #region Lifecycle
watchEffect((onCleanup) => {
    const editor = props.editor;

    if (!editor) {
        isVisible.value = false;
        return;
    }

    /** Transaction handler — checks whether a media node is selected */
    function handleTransaction(): void {
        if (!editor) {
            return;
        }

        const isMediaActive = editor.isActive('image') || editor.isActive('video');

        if (!isMediaActive) {
            isVisible.value = false;
            showSizePanel.value = false;
            return;
        }

        const media = findSelectedMediaNode(editor);

        if (!media) {
            isVisible.value = false;
            showSizePanel.value = false;
            return;
        }

        activeNodeType.value = media.nodeName;
        const nodeType = media.nodeName;

        // Work out the current float
        if (editor.isActive(nodeType, { float: 'left' })) {
            currentFloat.value = 'left';
        } else if (editor.isActive(nodeType, { float: 'right' })) {
            currentFloat.value = 'right';
        } else if (editor.isActive(nodeType, { float: 'none' })) {
            currentFloat.value = 'none';
        } else {
            currentFloat.value = null;
        }

        // Work out the current verticalAlign
        currentVerticalAlign.value =
            VALIGN_OPTIONS.find((option) =>
                editor.isActive(nodeType, { verticalAlign: option.value })
            )?.value ?? null;

        updatePosition(media.element);
        isVisible.value = true;
    }

    // Initial check
    handleTransaction();

    editor.on('transaction', handleTransaction);

    onCleanup(() => {
        editor.off('transaction', handleTransaction);
    });
});

onBeforeUnmount(() => {
    isVisible.value = false;
    showSizePanel.value = false;
});
// #endregion
</script>

<template>
    <Teleport to="body">
        <Transition name="fade">
            <BricksPopoverSurface
                v-if="isVisible"
                density="compact"
                elevation="sm"
                :class="$style.TextEditorImageFloatPopover"
                :style="{ top: `${popoverTop}px`, left: `${popoverLeft}px` }"
            >
                <BricksTooltip top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[$style.button, { [$style._active]: currentFloat === 'left' }]"
                            @mousedown.prevent="setFloat('left')"
                        >
                            <BricksIcon icon="bs:text-indent-left" />
                        </button>
                    </template>
                    <BricksTooltipHint :text="t('bricks.textEditor.floatLeft')" />
                </BricksTooltip>

                <BricksTooltip top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[$style.button, { [$style._active]: currentFloat === 'right' }]"
                            @mousedown.prevent="setFloat('right')"
                        >
                            <BricksIcon icon="bs:text-indent-right" />
                        </button>
                    </template>
                    <BricksTooltipHint :text="t('bricks.textEditor.floatRight')" />
                </BricksTooltip>

                <BricksTooltip top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[$style.button, { [$style._active]: isFloatCleared }]"
                            @mousedown.prevent="setFloat(null)"
                        >
                            <BricksIcon icon="ph:x" />
                        </button>
                    </template>
                    <BricksTooltipHint :text="t('bricks.textEditor.floatNone')" />
                </BricksTooltip>

                <div :class="$style.separator" />
                <BricksTooltip v-for="option in VALIGN_OPTIONS" :key="option.value" top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[
                                $style.button,
                                {
                                    [$style._active]: currentVerticalAlign === option.value,
                                },
                            ]"
                            @mousedown.prevent="setVerticalAlign(option.value)"
                        >
                            <BricksIcon :icon="option.icon" />
                        </button>
                    </template>
                    <BricksTooltipHint :text="t(option.label)" />
                </BricksTooltip>

                <div :class="$style.separator" />
                <BricksTooltip top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[$style.button, { [$style._active]: showSizePanel }]"
                            @mousedown.prevent="toggleSizePanel"
                        >
                            <BricksIcon icon="ph:arrows-out" />
                        </button>
                    </template>
                    <BricksTooltipHint :text="t('bricks.textEditor.size')" />
                </BricksTooltip>

                <TextEditorImageSizePanel
                    v-if="showSizePanel"
                    :editor="props.editor"
                    :active-node-type="activeNodeType"
                />
            </BricksPopoverSurface>
        </Transition>
    </Teleport>
</template>

<style module lang="scss">
.TextEditorImageFloatPopover {
    position: fixed;
    display: flex;
    gap: 0.2rem;
    transform: translate(-50%, calc(-100% - 0.6rem));
}

.button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    color: var(--bricks-base-600);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }

    &:hover {
        background-color: var(--bricks-base-100);
        color: var(--bricks-base-900);
    }

    &._active {
        background-color: var(--bricks-primary-100);
        color: var(--bricks-primary);
    }
}

.separator {
    width: 1px;
    margin: 0.4rem 0.2rem;
    background: var(--bricks-base-200);
}
</style>
