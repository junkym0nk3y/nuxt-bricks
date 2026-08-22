<script setup lang="ts">
/**
 * @description One block on the canvas: the frame around the rendered block, its
 * selection, hover and drag states, and the context menu.
 *
 * The rendered block stays inert (`pointer-events`), so a click selects the block instead
 * of activating what is inside it. Nested canvas items are exempt from that ban, and the
 * container blocks put `pointer-events: auto` back on themselves; both halves are needed —
 * an explicit ban on a nested item hands the click to its parent, and the child block
 * stops being selectable. Inline editing and interactive preview lift the ban for their
 * own subtree.
 *
 * The context menu is teleported into body because the canvas sheet carries a
 * `transform: scale()`: a `position: fixed` element inside it takes the scaled sheet as
 * its containing block, so the menu would be shrunk and blurred along with the content.
 * The Teleport itself stays inside the root div — the canvas TransitionGroup needs a
 * single root element, and a second one would keep the block out of the smooth flow shift.
 */

// #region Imports
// Types
import type { ICanvasItemProps, IDragComposableCanvas } from '../../types/components';

// Vue
import { computed, inject, provide } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Composables
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';
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
import BuilderCanvasItemContextMenu from './BuilderCanvasItemContextMenu.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ICanvasItemProps>(), {});
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const dragComposable = inject<IDragComposableCanvas | undefined>('dragComposable');
const { canEdit } = useBuilderPermissions();

/**
 * Active viewport (in Figma mode it comes per viewport from BuilderCanvasViewport); read
 * only while isFigmaMode.
 */
const figmaViewport = inject(CANVAS_VIEWPORT_KEY, null);
// #endregion

// #region Computed
/**
 * Selection of the block. Both selection and hover raise its z-index together with the
 * ring: neighbors stand flush, and without the lift they covered the outer shadow with
 * their own background — the bottom edge of the ring went missing.
 */
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

/**
 * Whether the block is wrapped in `.bricks-container`.
 *
 * The ring of a wrapped root block is drawn on the container content, so it repeats the
 * content width (accounting for the aside padding) instead of the whole canvas width. A
 * full-width block has no container, and there the ring stays on the item itself and
 * stretches across the canvas.
 */
const needsContainerWrapper = computed<boolean>(() => {
    if (props.component.parent) {
        return false;
    }
    return props.component.fullWidth !== true;
});

const isInteractiveLayout = computed<boolean>(
    () => componentsStore.interactivePreviewId === props.component.id
);

/**
 * The block being dragged. Its collapse starts from the measured height of the dragged
 * block, which the store has already put into a canvas CSS variable — max-height animates
 * from that value rather than from auto.
 */
const isDragSource = computed<boolean>(
    () =>
        canvasStore.dragState.source === 'canvas' &&
        canvasStore.dragState.componentId === props.component.id
);

/** The original of the dragged block frees its spot, and the neighbors close in smoothly */
const isDragSourceVacated = computed<boolean>(
    () => isDragSource.value && canvasStore.dragState.sourceVacated
);

provide('canvasIsInteractive', isInteractiveLayout);
// #endregion

// Layout: itemStyle, layoutProps, layoutName, childComponents, isSpaceLayout, isLayout
const { isLayout, layoutName, isSpaceLayout, itemStyle, layoutProps, childComponents } =
    useCanvasItemLayout(props);

// Component loading plus forceRender
const { ComponentInstance, forceRenderKey } = useCanvasItemLoader(props, isLayout);

// Inline editing + provide('inlineEditingContext')
const { isInlineEditing, handleDoubleClick } = useCanvasItemInlineEditing(
    props,
    isLayout,
    layoutName
);

/**
 * Whether the block can be dragged. A role without edit rights drags nothing at all: the
 * attribute is removed rather than the handler suppressed — otherwise the browser still
 * trails a "ghost" of the block behind the cursor, promising a move that will not happen.
 */
const isDraggable = computed<boolean>(() => !isInlineEditing.value && canEdit.value);

// Drag & drop
const { handleDragStart, handleDragEnd } = useCanvasItemDrag(
    props,
    isInlineEditing,
    dragComposable
);

// Context menu actions + states
const {
    isFavorite,
    canMoveUp,
    canMoveDown,
    canPaste,
    contextMenuPosition,
    isInteractivePreview,
    handleClick,
    handleContextMenu,
    closeContextMenu,
    handleEdit,
    handleDelete,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleToggleHidden,
    handleToggleDevice,
    handleMoveUp,
    handleMoveDown,
    handleToggleFavorite,
    handleToggleInteractivePreview,
} = useCanvasItemActions(props, figmaViewport);
</script>

<template>
    <div
        :class="[
            $style.BuilderCanvasItem,
            ...deviceVisibilityClasses,
            {
                [$style.selected]: isSelected,
                [$style.contained]: needsContainerWrapper,
                [$style.hidden]: isHidden && canvasStore.showGrid,
                [$style.fullyHidden]: isHidden && !canvasStore.showGrid,
                [$style.spaceLayout]: isSpaceLayout,
                [$style.editing]: isInlineEditing,
                [$style.interactive]: isInteractiveLayout,
                [$style.dragSource]: isDragSource,
                [$style.dragSourceVacated]: isDragSourceVacated,
            },
        ]"
        :style="itemStyle"
        :draggable="isDraggable"
        data-layout-drop-item="true"
        :data-component-id="props.component.id"
        :data-slot-child="props.component.slotName ? 'true' : null"
        :data-slot-name="props.component.slotName || null"
        @click="handleClick"
        @dblclick="handleDoubleClick"
        @contextmenu="handleContextMenu"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
    >
        <div v-if="isHidden && canvasStore.showGrid" :class="$style.hiddenLabel">Отключен</div>

        <BuilderCanvasItemLayout
            v-if="isLayout"
            :component="props.component"
            :layout-name="layoutName"
            :layout-props="layoutProps"
            :component-bound-props="componentBoundProps"
            :needs-container-wrapper="needsContainerWrapper"
            :child-components="childComponents"
        />

        <BuilderCanvasItemComponent
            v-else-if="ComponentInstance"
            :key="forceRenderKey"
            :component="props.component"
            :component-instance="ComponentInstance"
            :component-bound-props="componentBoundProps"
            :needs-container-wrapper="needsContainerWrapper"
        />

        <div v-else :class="$style.placeholder">
            <span>{{ props.component.componentName }}</span>
        </div>

        <Teleport to="body">
            <Transition name="bricks-canvas-context-menu">
                <BuilderCanvasItemContextMenu
                    v-if="contextMenuPosition"
                    :position="contextMenuPosition"
                    :component-name="props.component.componentName"
                    :is-hidden="isHidden"
                    :is-favorite="isFavorite"
                    :device-visibility="props.component.deviceVisibility"
                    :can-move-up="canMoveUp"
                    :can-move-down="canMoveDown"
                    :is-interactive-preview="isInteractivePreview"
                    :can-paste="canPaste"
                    @edit="handleEdit"
                    @copy="handleCopy"
                    @paste="handlePaste"
                    @duplicate="handleDuplicate"
                    @delete="handleDelete"
                    @toggle-hidden="handleToggleHidden"
                    @toggle-device="handleToggleDevice"
                    @move-up="handleMoveUp"
                    @move-down="handleMoveDown"
                    @toggle-favorite="handleToggleFavorite"
                    @toggle-interactive-preview="handleToggleInteractivePreview"
                    @close="closeContextMenu"
                />
            </Transition>
        </Teleport>
    </div>
</template>

<style module lang="scss">
.BuilderCanvasItem {
    position: relative;
    display: flex;
    flex-direction: column;
    transition: box-shadow var(--bricks-default-transition);
    cursor: pointer;
    user-select: none;

    &.spaceLayout {
        width: 100%;
        min-height: unset;
    }

    > * {
        pointer-events: none;
    }

    > * *:not([data-layout-drop-item]) {
        pointer-events: none;
    }

    &:hover {
        z-index: 9;
        box-shadow: var(--bricks-canvas-ring-hover);
    }

    &.selected {
        z-index: 10;
        box-shadow: var(--bricks-canvas-ring-active);
    }

    &.contained {
        > :global(.bricks-container) > * {
            transition: box-shadow var(--bricks-default-transition);
        }

        &:hover,
        &.selected,
        &.editing {
            box-shadow: none;
        }

        &:hover > :global(.bricks-container) > * {
            box-shadow: var(--bricks-canvas-ring-hover);
        }

        &.selected > :global(.bricks-container) > *,
        &.editing > :global(.bricks-container) > * {
            box-shadow: var(--bricks-canvas-ring-active);
        }
    }

    &.editing {
        z-index: 10;
        box-shadow: var(--bricks-canvas-ring-active);
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

    &.dragSource {
        max-height: var(--bricks-drag-placeholder-height);
    }

    &.dragSourceVacated {
        overflow: hidden;
        max-height: 0;
        margin-block: 0;
        opacity: 0;
        transition:
            max-height 180ms cubic-bezier(0.2, 0, 0, 1),
            margin-block 180ms cubic-bezier(0.2, 0, 0, 1),
            opacity 120ms ease;
        pointer-events: none;
    }

    &.hidden {
        position: relative;

        &:before {
            content: '';
            position: absolute;
            inset: 0;
            z-index: 15;
            background: var(--bricks-base-0);
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
        border-radius: var(--bricks-border-radius-xs);
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
    border: 0.2rem dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    text-align: center;
    font-size: 1.4rem;
    color: var(--bricks-base-600);
}
</style>
