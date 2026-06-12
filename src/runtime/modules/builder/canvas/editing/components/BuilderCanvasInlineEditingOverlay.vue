<script setup lang="ts">
// #region Imports
// Vue
import { computed, ref, watch, useCssModule } from 'vue';

// Pinia
import { useInlineEditingStore } from '../../../../text-editor/stores/inlineEditing';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useComponentsStore } from '../../../core/stores/components';

// Utils
import { insertMediaIntoEditor } from '../../../../text-editor/utils/insertMediaIntoEditor';

// Composables
import { useToolbarStateSync } from '../../../../text-editor/composables/useToolbarStateSync';
import { useInlineEditingFallback } from '../composables/useInlineEditingFallback';
import { useDraggableOverlay } from '../composables/useDraggableOverlay';

// Components
import BricksTextEditorToolbar from '../../../../ui/inputs/BricksTextEditorToolbar.vue';
import TextEditorImageFloatPopover from '../../../../text-editor/components/TextEditorImageFloatPopover.vue';
import BuilderCanvasInlineEditingHeader from './BuilderCanvasInlineEditingHeader.vue';
// #endregion

// #region Data
const $style = useCssModule();
const inlineEditingStore = useInlineEditingStore();
const canvasStore = useCanvasStore();
const componentsStore = useComponentsStore();

const overlayRef = ref<HTMLElement | null>(null);

/**
 * Toolbar-синк с TipTap-транзакциями: состояние selects + конфигурация групп.
 * Группы пустые вне textarea-типа (тулбар показывается только для него).
 */
const { toolbarGroups, resetToolbarState } = useToolbarStateSync(() => inlineEditingStore.editor, {
    isEnabled: () => inlineEditingStore.propType === 'textarea',
});

/**
 * Fallback TipTap editor для brick-компонентов с textarea/inline-content:
 * создаётся, если ни один layout-компонент не инициализировал свой editor.
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
 * Перетаскивание и позиционирование overlay. В Figma Mode несколько экземпляров
 * одного компонента присутствуют в DOM одновременно, поэтому якорь — элемент
 * из стора (тот, на котором был dblclick), а не querySelector.
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
 * Показывать ли overlay.
 */
const isVisible = computed<boolean>(() => inlineEditingStore.isEditing);

/**
 * Показывать ли TipTap-тулбар (только для textarea типа).
 */
const showToolbar = computed<boolean>(
    () => isVisible.value && inlineEditingStore.propType === 'textarea'
);

/**
 * Показывать ли кнопку переключения фона (есть fallback wrapper).
 */
const hasFallbackWrapper = computed<boolean>(() => showFallbackEditor.value);

/**
 * CSS классы для fallback wrapper с поддержкой тёмного фона.
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
 * Закрывает тулбар, если редактируемый компонент перестал быть выбранным в билдере.
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
 * Закрывает тулбар при переключении адаптивов (viewport / Figma mode).
 */
watch(
    () => canvasStore.isViewportSwitching,
    (switching) => {
        if (switching && inlineEditingStore.isEditing) {
            inlineEditingStore.stopEditing();
        }
    }
);
// #endregion

// #region Methods
/**
 * Переключает на предыдущее свойство.
 */
function handleSwitchPrev(): void {
    if (isFallbackMode.value) {
        saveFallbackToStore();
    }
    inlineEditingStore.switchToPrevProp();
}

/**
 * Переключает на следующее свойство.
 */
function handleSwitchNext(): void {
    if (isFallbackMode.value) {
        saveFallbackToStore();
    }
    inlineEditingStore.switchToNextProp();
}

/**
 * Сохраняет и выходит из inline editing.
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
 * Запрашивает медиа из MediaGallery через inlineEditingStore.
 * При выборе вставляет изображение или видео в TipTap-редактор.
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
        <Transition name="library-canvas-toolbar">
            <div
                v-if="isVisible && !canvasStore.isViewportSwitching"
                ref="overlayRef"
                :class="[
                    $style.BuilderCanvasInlineEditingOverlay,
                    { [$style._dragging]: isDragging },
                ]"
                :style="overlayStyle"
            >
                <!-- Drag handle -->
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
                    :prop-label="inlineEditingStore.currentPropLabel || 'Инлайн редактор'"
                    :editable-props-count="inlineEditingStore.editablePropsCount"
                    :current-prop-index="inlineEditingStore.currentPropIndex"
                    :can-switch-prev="inlineEditingStore.canSwitchPrev"
                    :can-switch-next="inlineEditingStore.canSwitchNext"
                    @switch-prev="handleSwitchPrev"
                    @switch-next="handleSwitchNext"
                />

                <!-- TipTap Toolbar (только для textarea-типа или fallback wrapper) -->
                <BricksTextEditorToolbar
                    v-if="(showToolbar && toolbarGroups.length > 0) || hasFallbackWrapper"
                    :groups="toolbarGroups"
                    compact
                    use-tooltips
                    :show-image-insert="showToolbar && toolbarGroups.length > 0"
                    :show-background-toggle="
                        showToolbar && toolbarGroups.length > 0 && hasFallbackWrapper
                    "
                    :is-dark-background="isDarkEditorBackground"
                    @request-image="handleRequestImage"
                    @toggle-background="toggleEditorBackground"
                />

                <!-- Fallback TipTap editor (для brick-компонентов с textarea/inline-content) -->
                <div v-if="showFallbackEditor" :class="fallbackWrapperClasses">
                    <component :is="fallbackEditorContent!" :editor="fallbackEditor!" />
                </div>

                <!-- Footer: Done button + hint -->
                <div :class="$style.footer">
                    <button type="button" :class="$style.doneButton" @click="handleDone">
                        Готово
                    </button>
                    <span :class="$style.hint">Esc — выйти</span>
                </div>
            </div>
        </Transition>

        <TextEditorImageFloatPopover :editor="inlineEditingStore.editor" />
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
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    resize: horizontal;
    flex-direction: column;
    gap: 0.4rem;
    box-shadow: var(--shadow-md);
    pointer-events: auto;
    transition:
        opacity var(--default-transition),
        box-shadow var(--default-transition);

    &._dragging {
        box-shadow: var(--shadow-lg);
        opacity: 0.6;
    }
}

.dragHandle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    height: 1.8rem;
    border-radius: var(--border-radius-xs);
    color: var(--bricks-base-300);
    transition:
        background var(--default-transition),
        color var(--default-transition);
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

.doneButton {
    padding: 0.3rem 1rem;
    border-radius: var(--border-radius-xs);
    border: none;
    background: var(--bricks-primary);
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 600;
    color: #fff;
    transition: opacity var(--default-transition);
    cursor: pointer;

    &:hover {
        opacity: 0.85;
    }
}

.hint {
    white-space: nowrap;
    font-size: 1.1rem;
    color: var(--bricks-base-500);
}

.fallbackEditorWrapper {
    --bricks-base-0: #fff;

    overflow-y: auto;
    max-height: 20rem;
    padding: 0.4rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    background-color: var(--bricks-base-0);
    font-size: 1.4rem;
    line-height: 1.5;
    color: initial;

    :global(.ProseMirror) {
        min-height: 4rem;
        outline: none;
    }

    &._darkPreview {
        border-color: #212226;
        background: #212226;

        :global(.ProseMirror) {
            background: #212226;
        }
    }
}
</style>
