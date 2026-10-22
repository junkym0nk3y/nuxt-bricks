<script setup lang="ts">
/**
 * @description Floating panel of inline editing: the header with the property switcher,
 * the TipTap toolbar, the fallback editor and the footer.
 *
 * The surface is written by hand instead of being taken from `BricksPopoverSurface`: the
 * reference to this node goes into the drag composable as an element, and swapping it for
 * an instance of the component for the sake of an identical look is not worth it. The `md`
 * shadow is the same elevation tier the other popovers use; while the panel is dragged it
 * rises to `lg` as a state, not as a divergence. The Esc hint is kept from wrapping: the
 * footer is narrow, and a wrapped line would stretch the panel in height right under the
 * cursor.
 */

// #region Imports
// Vue
import { computed, ref, watch, useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useInlineEditingStore } from '../../../../text-editor/stores/inlineEditing';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useComponentsStore } from '../../../core/stores/components';

// Utils
import { insertMediaIntoEditor } from '../../../../text-editor/utils/insertMediaIntoEditor';
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';

// Composables
import { useTextEditorLink } from '../../../../text-editor/composables/useTextEditorLink';
import { useToolbarStateSync } from '../../../../text-editor/composables/useToolbarStateSync';
import { useInlineEditingFallback } from '../composables/useInlineEditingFallback';
import { useDraggableOverlay } from '../composables/useDraggableOverlay';

// Components
import BricksTextEditorToolbar from '../../../../ui/inputs/BricksTextEditorToolbar.vue';
import BricksFieldHint from '../../../../ui/inputs/BricksFieldHint.vue';
import TextEditorImageFloatPopover from '../../../../text-editor/components/TextEditorImageFloatPopover.vue';
import TextEditorLinkModal from '../../../../text-editor/components/TextEditorLinkModal.vue';
import BuilderCanvasInlineEditingHeader from './BuilderCanvasInlineEditingHeader.vue';
// #endregion

// #region Data
const { t, te } = useI18n();
const $style = useCssModule();
const inlineEditingStore = useInlineEditingStore();
const canvasStore = useCanvasStore();
const componentsStore = useComponentsStore();

const overlayRef = ref<HTMLElement | null>(null);

/**
 * Link form of the editor active on the canvas.
 */
const {
    isLinkModalOpen,
    linkValue,
    hasLinkAtSelection,
    openLinkModal,
    applyLink,
    removeLink,
    closeLinkModal,
} = useTextEditorLink(() => inlineEditingStore.editor);

/**
 * Toolbar synced with the TipTap transactions: the state of the selects plus the
 * configuration of the groups. Outside a textarea-typed property the groups stay empty —
 * the toolbar is shown for that type only.
 */
const { toolbarGroups, resetToolbarState } = useToolbarStateSync(() => inlineEditingStore.editor, {
    isEnabled: () => inlineEditingStore.propType === 'textarea',
    onRequestLink: openLinkModal,
});

/**
 * Fallback TipTap editor of the overlay; when it is created and why lives in
 * `useInlineEditingFallback`.
 */
const {
    isFallbackMode,
    fallbackEditor,
    fallbackEditorContent,
    showFallbackEditor,
    isDarkEditorBackground,
    toggleEditorBackground,
    saveFallbackToStore,
    destroyFallbackEditor,
} = useInlineEditingFallback({ onPropSwitch: resetToolbarState });

/**
 * Dragging and positioning of the overlay. In Figma mode several instances of one
 * component are present in the DOM at once, so the anchor is the element kept in the store
 * — the one the double click landed on — and not a querySelector result.
 */
const { isDragging, overlayStyle, onDragHandleMousedown } = useDraggableOverlay({
    overlayRef,
    anchorElement: () => inlineEditingStore.editingElement,
    cursorOffset: () => inlineEditingStore.cursorOffset,
    resetKey: () => inlineEditingStore.componentId,
});
// #endregion

// #region Computed
/**
 * Whether to show the overlay.
 */
const isVisible = computed<boolean>(() => inlineEditingStore.isEditing);

/**
 * Label of the current property: `bricks.*` keys from the definitions are resolved into a
 * translation, while custom strings of the consumer pass through as they are.
 */
const currentPropLabel = computed<string>(
    () =>
        resolveBricksLabel(t, te, inlineEditingStore.currentPropLabel) ||
        t('bricks.textEditor.inlineEditor')
);

/**
 * Whether to show the TipTap toolbar (for a textarea-typed property only).
 */
const showToolbar = computed<boolean>(
    () => isVisible.value && inlineEditingStore.propType === 'textarea'
);

/**
 * Whether the overlay renders the fallback editor: the toolbar is shown above it as well,
 * outside a textarea-typed property too.
 */
const hasFallbackWrapper = computed<boolean>(() => showFallbackEditor.value);

/**
 * CSS classes of the fallback wrapper, including the dark background.
 */
const fallbackWrapperClasses = computed(() => [
    $style.fallbackEditorWrapper,
    {
        [$style._darkPreview]: isDarkEditorBackground.value,
    },
]);
// #endregion

// #region Lifecycle
/**
 * Closes the panel once the edited component stops being the selected one in the builder.
 */
watch(
    () => componentsStore.selectedComponent?.id,
    (selectedId) => {
        if (inlineEditingStore.isEditing && selectedId !== inlineEditingStore.componentId) {
            inlineEditingStore.stopEditing();
        }
    }
);

/**
 * Closes the panel on a switch between viewports or into Figma mode.
 */
watch(
    () => canvasStore.isViewportSwitching,
    (switching) => {
        if (switching && inlineEditingStore.isEditing) {
            inlineEditingStore.stopEditing();
        }
    }
);

/**
 * Closes the link form together with the exit from inline editing: the editor whose
 * selection it applied to is destroyed by then, and a form left open would apply the link
 * to nowhere. The flag is cleared directly — closeLinkModal would return the focus into an
 * editor that no longer exists.
 */
watch(isVisible, (visible) => {
    if (!visible) {
        isLinkModalOpen.value = false;
    }
});
// #endregion

// #region Methods
/**
 * Switches to the previous property.
 */
function handleSwitchPrev(): void {
    if (isFallbackMode.value) {
        saveFallbackToStore();
    }
    inlineEditingStore.switchToPrevProp();
}

/**
 * Switches to the next property.
 */
function handleSwitchNext(): void {
    if (isFallbackMode.value) {
        saveFallbackToStore();
    }
    inlineEditingStore.switchToNextProp();
}

/**
 * Saves the value and leaves inline editing.
 */
function handleDone(): void {
    if (isFallbackMode.value) {
        saveFallbackToStore();
        componentsStore.saveToHistory();
        destroyFallbackEditor();
    }
    inlineEditingStore.stopEditing();
}

/**
 * Requests media from the media gallery through inlineEditingStore, and inserts the chosen
 * image or video into the TipTap editor.
 */
function handleRequestImage(): void {
    const ed = inlineEditingStore.editor;
    if (!ed) {
        return;
    }

    inlineEditingStore.requestMedia((item) => insertMediaIntoEditor(ed, item));
}
// #endregion
</script>

<template>
    <Teleport to="body">
        <Transition name="bricks-canvas-toolbar">
            <div
                v-if="isVisible && !canvasStore.isViewportSwitching"
                ref="overlayRef"
                :class="[
                    $style.BuilderCanvasInlineEditingOverlay,
                    { [$style._dragging]: isDragging },
                ]"
                :style="overlayStyle"
            >
                <div :class="$style.dragHandle" @mousedown="onDragHandleMousedown">
                    <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor">
                        <circle cx="4" cy="2" r="1.5" />
                        <circle cx="8" cy="2" r="1.5" />
                        <circle cx="12" cy="2" r="1.5" />
                        <circle cx="4" cy="8" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="12" cy="8" r="1.5" />
                    </svg>
                </div>

                <BuilderCanvasInlineEditingHeader
                    :prop-label="currentPropLabel"
                    :editable-props-count="inlineEditingStore.editablePropsCount"
                    :current-prop-index="inlineEditingStore.currentPropIndex"
                    :can-switch-prev="inlineEditingStore.canSwitchPrev"
                    :can-switch-next="inlineEditingStore.canSwitchNext"
                    @switch-prev="handleSwitchPrev"
                    @switch-next="handleSwitchNext"
                />

                <BricksTextEditorToolbar
                    v-if="(showToolbar && toolbarGroups.length > 0) || hasFallbackWrapper"
                    :groups="toolbarGroups"
                    compact
                    use-tooltips
                    :show-image-insert="showToolbar && toolbarGroups.length > 0"
                    @request-image="handleRequestImage"
                />

                <div v-if="showFallbackEditor" :class="$style.fallbackEditorContainer">
                    <div :class="fallbackWrapperClasses">
                        <component :is="fallbackEditorContent!" :editor="fallbackEditor!" />
                    </div>

                    <button
                        v-if="showToolbar && toolbarGroups.length > 0"
                        type="button"
                        :title="t('bricks.textEditor.toolbar.darkBackground')"
                        :class="[
                            $style.backgroundToggleButton,
                            { [$style._active]: isDarkEditorBackground },
                        ]"
                        @click="toggleEditorBackground"
                    >
                        <BricksIcon icon="ph:circle-half-tilt" />
                    </button>
                </div>

                <div :class="$style.footer">
                    <button type="button" :class="$style.doneButton" @click="handleDone">
                        {{ t('bricks.textEditor.done') }}
                    </button>
                    <BricksFieldHint :class="$style.escHint">{{
                        t('bricks.textEditor.escToExit')
                    }}</BricksFieldHint>
                </div>
            </div>
        </Transition>

        <TextEditorImageFloatPopover :editor="inlineEditingStore.editor" />

        <TextEditorLinkModal
            :is-open="isLinkModalOpen"
            :value="linkValue"
            :can-remove="hasLinkAtSelection"
            @apply="applyLink"
            @remove="removeLink"
            @close="closeLinkModal"
        />
    </Teleport>
</template>

<style module lang="scss">
.BuilderCanvasInlineEditingOverlay {
    z-index: 1;
    overflow: hidden;
    display: flex;
    width: 46rem;
    min-width: 22rem;
    max-width: 80rem;
    padding: 0.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    resize: horizontal;
    flex-direction: column;
    gap: 0.4rem;
    box-shadow: var(--bricks-shadow-md);
    pointer-events: auto;
    transition:
        opacity var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

    &._dragging {
        box-shadow: var(--bricks-shadow-lg);
        opacity: 0.6;
    }
}

.dragHandle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    height: 1.8rem;
    border-radius: var(--bricks-border-radius-xs);
    color: var(--bricks-base-300);
    transition:
        background var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: grab;
    user-select: none;

    &:hover {
        background: var(--bricks-base-100);
        color: var(--bricks-base-500);
    }
}

.footer {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--bricks-base-200);
}

.escHint {
    white-space: nowrap;
}

.doneButton {
    padding: 0.4rem 1rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: var(--bricks-primary);
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-static-white);
    transition: opacity var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        opacity: 0.85;
    }
}

.fallbackEditorContainer {
    position: relative;
}

.backgroundToggleButton {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    color: var(--bricks-base-500);
    opacity: 0;
    transition:
        border-color var(--bricks-default-transition),
        background var(--bricks-default-transition),
        color var(--bricks-default-transition),
        opacity var(--bricks-default-transition);
    cursor: pointer;

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }

    .fallbackEditorContainer:hover & {
        opacity: 1;
    }

    &:hover {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
    }

    &._active {
        border-color: var(--bricks-primary);
        background: var(--bricks-primary);
        color: var(--bricks-static-white);
    }
}

.fallbackEditorWrapper {
    --bricks-base-0: #fff;
    --bricks-base-200: #e5e7eb;
    --bricks-base-900: #111827;
    --bricks-primary: #2563eb;

    overflow-y: auto;
    max-height: 20rem;
    padding: 0.4rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    font-size: 1.4rem;
    line-height: 1.5;
    color: var(--bricks-base-900);

    :global(.ProseMirror) {
        min-height: 4rem;
        outline: none;
    }

    &._darkPreview {
        border-color: var(--bricks-dark-surface);
        background: var(--bricks-dark-surface);

        :global(.ProseMirror) {
            background: var(--bricks-dark-surface);
        }
    }
}
</style>
