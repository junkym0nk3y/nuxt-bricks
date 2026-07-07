<script setup lang="ts">
// #region Imports
// Types
import type { ICanvasItemProps, IDragComposableCanvas } from '../../types/components';

// Vue
import { computed, ref, inject, provide, watch } from 'vue';

// VueUse
import { useElementBounding } from '@vueuse/core';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Composables
import { useCanvasItemLayout } from '../composables/useCanvasItemLayout';
import { useCanvasItemLoader } from '../composables/useCanvasItemLoader';
import { useCanvasItemInlineEditing } from '../../editing/composables/useCanvasItemInlineEditing';
import { useCanvasItemDrag } from '../composables/useCanvasItemDrag';
import { useCanvasItemActions } from '../composables/useCanvasItemActions';

// Utils
import { buildDeviceVisibilityClasses } from '../../../../common/utils/bricks/deviceVisibility';
import { CANVAS_VIEWPORT_KEY } from '../../../../common/constants/injectionKeys';

// Components
import BuilderCanvasItemLayout from './BuilderCanvasItemLayout.vue';
import BuilderCanvasItemComponent from './BuilderCanvasItemComponent.vue';
import BuilderCanvasItemToolbar from './BuilderCanvasItemToolbar.vue';
// #endregion

// #region Props
const props = defineProps<ICanvasItemProps>();
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const dragComposable = inject<IDragComposableCanvas | undefined>('dragComposable');

/** Активный viewport (в Figma mode — per-viewport от BuilderCanvasViewport); используется только при isFigmaMode */
const figmaViewport = inject(CANVAS_VIEWPORT_KEY, null);

/** Ref корневого элемента для позиционирования телепортированного тулбара */
const canvasItemRef = ref<HTMLElement | null>(null);
const {
    top: itemTop,
    right: itemRight,
    update: updateBounding,
} = useElementBounding(canvasItemRef);
// #endregion

// #region Computed
const isSelected = computed<boolean>(() => componentsStore.isComponentSelected(props.component.id));
const isHidden = computed<boolean>(() => Boolean(props.component.isHidden));

const deviceVisibilityClasses = computed<string[]>(() =>
    buildDeviceVisibilityClasses(props.component.deviceVisibility)
);

const componentBoundProps = computed<Record<string, unknown>>(() => {
    const source = props.component.props || {};
    const { slot, fullWidth: _fullwidthProp, ...rest } = source as Record<string, unknown>;
    const result: Record<string, unknown> = { ...rest };
    if (props.component.htmlId) {
        result.id = props.component.htmlId;
    }
    return result;
});

const needsContainerWrapper = computed<boolean>(() => {
    if (props.component.parent) {
        return false;
    }
    return props.component.fullWidth !== true;
});

const isInteractiveLayout = computed<boolean>(
    () => componentsStore.interactivePreviewId === props.component.id
);

provide('canvasIsInteractive', isInteractiveLayout);
// #endregion

// Layout: itemStyle, layoutProps, layoutName, childComponents, isSpaceLayout, isLayout
const { isLayout, layoutName, isSpaceLayout, itemStyle, layoutProps, childComponents } =
    useCanvasItemLayout(props);

// Загрузка компонента + forceRender
const { ComponentInstance, forceRenderKey } = useCanvasItemLoader(props, isLayout);

// Inline editing + provide('inlineEditingContext')
const { isInlineEditing, handleDoubleClick } = useCanvasItemInlineEditing(
    props,
    isLayout,
    layoutName
);

// Drag & drop
const { handleDragStart, handleDragEnd } = useCanvasItemDrag(
    props,
    isInlineEditing,
    dragComposable
);

// Toolbar actions + states
const {
    isFavorite,
    canMoveUp,
    canMoveDown,
    showToolbar,
    toolbarFixedStyle,
    isInteractivePreview,
    handleClick,
    handleDelete,
    handleCopy,
    handleToggleHidden,
    handleToggleDevice,
    handleMoveUp,
    handleMoveDown,
    handleToggleFavorite,
    handleToggleInteractivePreview,
} = useCanvasItemActions(
    props,
    isLayout,
    layoutName,
    figmaViewport,
    itemTop,
    itemRight,
    isSelected
);

// #region Lifecycle
/**
 * Пересчитывает bounding rect тулбара при изменении масштаба канваса.
 * useElementBounding не реагирует на transform: scale() родителя.
 */
watch(
    () => canvasStore.scale,
    () => {
        setTimeout(updateBounding, 300);
    }
);
// #endregion
</script>

<template>
    <div
        ref="canvasItemRef"
        :class="[
            $style.BuilderCanvasItem,
            ...deviceVisibilityClasses,
            {
                [$style.selected]: isSelected,
                [$style.hidden]: isHidden && canvasStore.showGrid,
                [$style.fullyHidden]: isHidden && !canvasStore.showGrid,
                [$style.spaceLayout]: isSpaceLayout,
                [$style.editing]: isInlineEditing,
                [$style.interactive]: isInteractiveLayout,
            },
        ]"
        :style="itemStyle"
        :draggable="!isInlineEditing"
        data-layout-drop-item="true"
        :data-component-id="props.component.id"
        :data-slot-child="props.component.slotName ? 'true' : null"
        :data-slot-name="props.component.slotName || null"
        @click="handleClick"
        @dblclick="handleDoubleClick"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
    >
        <!-- Hidden Label -->
        <div v-if="isHidden && canvasStore.showGrid" :class="$style.hiddenLabel">Отключен</div>

        <!-- Render Layout Component -->
        <BuilderCanvasItemLayout
            v-if="isLayout"
            :component="props.component"
            :layout-name="layoutName"
            :layout-props="layoutProps"
            :component-bound-props="componentBoundProps"
            :needs-container-wrapper="needsContainerWrapper"
            :child-components="childComponents"
        />

        <!-- Render UI Component -->
        <BuilderCanvasItemComponent
            v-else-if="ComponentInstance"
            :key="forceRenderKey"
            :component="props.component"
            :component-instance="ComponentInstance"
            :component-bound-props="componentBoundProps"
            :needs-container-wrapper="needsContainerWrapper"
        />

        <!-- Fallback -->
        <div v-else :class="$style.placeholder">
            <span>{{ props.component.componentName }}</span>
        </div>
    </div>

    <!-- Floating Toolbar — телепортируется в body для чёткого рендеринга без canvas blur -->
    <Teleport to="body">
        <Transition name="library-canvas-toolbar">
            <BuilderCanvasItemToolbar
                v-if="showToolbar && !canvasStore.isViewportSwitching"
                :style="toolbarFixedStyle"
                :component-name="props.component.componentName"
                :is-hidden="isHidden"
                :is-favorite="isFavorite"
                :device-visibility="props.component.deviceVisibility"
                :can-move-up="canMoveUp"
                :can-move-down="canMoveDown"
                :is-interactive-preview="isInteractivePreview"
                @copy="handleCopy"
                @delete="handleDelete"
                @toggle-hidden="handleToggleHidden"
                @toggle-device="handleToggleDevice"
                @move-up="handleMoveUp"
                @move-down="handleMoveDown"
                @toggle-favorite="handleToggleFavorite"
                @toggle-interactive-preview="handleToggleInteractivePreview"
            />
        </Transition>
    </Teleport>
</template>

<style module lang="scss">
.BuilderCanvasItem {
    position: relative;
    display: flex;
    flex-direction: column;
    transition: all 150ms ease;
    cursor: pointer;
    user-select: none;

    &.spaceLayout {
        width: 100%;
        min-height: unset;
    }

    > * {
        pointer-events: none;
    }

    // Блокируем глубокие потомки (кнопки аккордеона и т.п.), но не child canvas-items
    > * *:not([data-layout-drop-item]) {
        pointer-events: none;
    }

    &:hover {
        outline: 0.2rem solid rgb(var(--rgb-primary) / 30%);
    }

    &.selected {
        z-index: 10;
        outline: 0.2rem solid rgb(var(--rgb-primary) / 80%);
    }

    &.editing {
        outline: 0.2rem solid rgb(var(--rgb-primary) / 80%);
        cursor: text;
        user-select: text;

        > * {
            pointer-events: auto;
        }

        > * *:not([data-layout-drop-item]) {
            pointer-events: auto;
        }
    }

    &.interactive {
        > * {
            pointer-events: auto;
        }

        > * *:not([data-layout-drop-item]) {
            pointer-events: auto;
        }
    }

    &.hidden {
        position: relative;

        &:before {
            content: '';
            position: absolute;
            inset: 0;
            z-index: 15;
            background: var(--bricks-base-0, #fff);
            opacity: 0.7;
            pointer-events: none;
        }

        > *:not(.hiddenLabel) {
            opacity: 0.5;
        }
    }

    &.fullyHidden {
        display: none;
    }

    .hiddenLabel {
        position: absolute;
        top: 1.4rem;
        left: 1.4rem;
        z-index: 20;
        height: auto;
        padding: 0.4rem 0.8rem;
        border-radius: var(--border-radius-xs);
        background: var(--bricks-base-900);
        font-size: 1.6rem;
        line-height: 1;
        color: var(--bricks-base-0);
        opacity: 0.7;
        pointer-events: none;
    }

    > div:not(.hiddenLabel) {
        height: 100%;
    }
}

.placeholder {
    padding: 2rem;
    border: 0.2rem dashed rgb(var(--rgb-gray) / 50%);
    background: rgb(var(--rgb-gray) / 10%);
    text-align: center;
    font-size: 1.4rem;
    color: var(--bricks-base-600);
}
</style>
