<script setup lang="ts">
// #region Imports
// Types
import type { IDragComposableCanvas } from '../../types/components';
import type { TDropFlowEntry } from '../../../core/types/drag';

// Vue
import { ref, computed, inject, provide, onMounted, onBeforeUnmount, nextTick } from 'vue';

// VueUse
import { useDebounceFn } from '@vueuse/core';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useSidebarStore } from '../../../core/stores/sidebar';
import { usePublishStore } from '../../../publish/stores/publish';

// Composables
import { useCanvas } from '../composables/useCanvas';
import { useBricksConfig } from '../../../../common/composables/useBricksConfig';
import { useCanvasDrops } from '../composables/useCanvasDrops';
import { useCanvasDropGuard } from '../composables/useCanvasDropGuard';
import { useCanvasDragAutoScroll } from '../composables/useCanvasDragAutoScroll';
import { useCanvasPan } from '../composables/useCanvasPan';
import { useCanvasWheel } from '../composables/useCanvasWheel';
import { useCanvasCentering } from '../composables/useCanvasCentering';
import { useCanvasContainerMetrics } from '../composables/useCanvasContainerMetrics';
import { useCanvasFlowGuard } from '../composables/useCanvasFlowGuard';
import { useInteractivePreviewDismiss } from '../composables/useInteractivePreviewDismiss';

// Utils
import { convertPxToRem } from '../../../../common/utils/main';
import { readOwnKey } from '../../../../common/utils/safeRecord';
import { buildDropFlowEntries, getDragPlaceholderVars } from '../../../core/utils/dragVisuals';

// Constants
import {
    CANVAS_DRAG_ACTIVE_KEY,
    CANVAS_VIEWPORT_KEY,
    INLINE_EDITOR_HOST_KEY,
} from '../../../../common/constants/injectionKeys';
import { scrollToComponentOnCanvas } from '../../../core/utils/scrollToComponent';

// Components
import BuilderCanvasItem from '../../item/components/BuilderCanvasItem.vue';
import BuilderCanvasBottomBar from './BuilderCanvasBottomBar.vue';
import BuilderCanvasDropPlaceholder from './BuilderCanvasDropPlaceholder.vue';
import BuilderCanvasEmptyState from './BuilderCanvasEmptyState.vue';
import BuilderCanvasViewport from './BuilderCanvasViewport.vue';
import BuilderCanvasInlineEditingOverlay from '../../editing/components/BuilderCanvasInlineEditingOverlay.vue';
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();
const config = useBricksConfig();
const {
    canvasContainer,
    canvasTransform,
    figmaBaseTransform,
    canvasContainerStyle,
    canvasWrapperStyle,
    figmaWrapperMinWidth,
    figmaGap,
    getRemCompensation,
    handleResize,
    resetZoom,
} = useCanvas();

const dragComposable = inject<IDragComposableCanvas | undefined>('dragComposable');
const isCanvasDragActive = computed<boolean>(() => canvasStore.dragState.source !== null);

provide(
    'showGrid',
    computed(() => canvasStore.showGrid)
);

provide(CANVAS_DRAG_ACTIVE_KEY, isCanvasDragActive);

/** Active viewport of the normal mode (in Figma mode BuilderCanvasViewport overrides it) */
provide(
    CANVAS_VIEWPORT_KEY,
    computed(() => canvasStore.viewport)
);

/**
 * The rule of a permitted move, for the drop zones of the blocks and of the slots: they
 * ask it before promising a place. In Figma mode each viewport publishes its own — the
 * cells of a Grid are counted per sheet.
 */
useCanvasDropGuard(() => canvasStore.viewport);

/** Rem compensation for the per-viewport scaling of Figma mode */
provide('getRemCompensation', getRemCompensation);

/** Port from inline editing to the components store (text-editor does not import builder/core) */
provide(INLINE_EDITOR_HOST_KEY, {
    getPropValue: (componentId, propName) => {
        const component = componentsStore.getComponentById(componentId);
        if (!component?.props) {
            return undefined;
        }

        // The prop name is declared by the brick file and the props object comes from the
        // schema: `props['toString']` would hand the editor a method of the prototype
        return readOwnKey(component.props as Record<string, unknown>, propName);
    },
    updateProp: (componentId, propName, value) => {
        componentsStore.updateComponentProp(componentId, propName, value);
    },
    commitHistory: () => {
        componentsStore.saveToHistory();
    },
});

const canvasRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const isMounted = ref(false);

const {
    rootDropIndex,
    isRootPlaceholderContained,
    handleRootDragEnter,
    handleRootDragOver,
    handleRootDragLeave,
    handleCanvasDrop,
    handleCanvasDragOver,
    handleLayoutDrop,
    handleSlotDrop,
} = useCanvasDrops({
    dragComposable,
    componentsStore,
    canvasRef,
    containerRef,
});

// Silences the move transitions of the flow while the canvas geometry changes — why, in
// the composable itself
useCanvasFlowGuard(canvasRef);

// Scrolls the canvas while a drag is held near an edge — why the wheel cannot do it, in
// the composable itself
useCanvasDragAutoScroll(canvasContainer);

const { isPanning, handleCanvasAreaPointerDown } = useCanvasPan(canvasContainer);

const { zoomInAtCenter, zoomOutAtCenter } = useCanvasWheel(canvasContainer);

const { scheduleCanvasCenter } = useCanvasCentering(canvasContainer);

const { updateContainerMetrics, initMetricsObserver } = useCanvasContainerMetrics({
    containerRef,
    scheduleCanvasCenter,
    scrollToSelected: scrollToSelectedAfterViewportSwitch,
});

useInteractivePreviewDismiss();
// #endregion

// #region Computed
/**
 * Offset of the left sidebar, used to position the bottom bar.
 *
 * @returns Width of the left sidebar while it is visible, otherwise '0px'
 */
const leftSidebarOffset = computed(() => {
    return sidebarStore.left.visible ? sidebarStore.left.width : '0px';
});

/**
 * Offset of the right properties panel, used to position the bottom bar.
 *
 * @returns Width of the right panel while it is visible, otherwise '0px'
 */
const rightSidebarOffset = computed(() => {
    return sidebarStore.right.visible ? sidebarStore.right.width : '0px';
});

/**
 * Styles of the canvas sheet: its size from the canvas store, the background color from
 * the publish settings, the font from the config and the CSS variables of the drag
 * placeholder. The transform joins them only after mount: on the server the fit scale
 * cannot be measured (`calculateOptimalScale` answers 1 without a `window`), and writing
 * that 1 into the markup would disagree with the scale the client computes on hydration.
 *
 * Fitting the sheet is the job of `transform: scale()` alone, and the sheet is
 * `flex-shrink: 0` in the wrapper for exactly that reason: for a flex item the declared
 * width behaves as a flex-basis, so the scale was applied twice (the transform plus a real
 * shrink of the layout width), the grid computed 1fr from the wrong width, and the canvas
 * showed something other than the published page.
 *
 * @returns Style object of the canvas element
 */
const canvasStyle = computed<Record<string, string>>(() => {
    const baseStyle = {
        width: convertPxToRem(canvasStore.width),
        height: convertPxToRem(canvasStore.height),
        backgroundColor: publishStore.currentFormState.backgroundColor || 'var(--bricks-base-0)',
        fontFamily: config.defaultFont,
        ...getDragPlaceholderVars(canvasStore.dragState),
    };

    if (!isMounted.value) {
        // No dynamic styles under SSR
        return baseStyle;
    }

    return {
        ...baseStyle,
        transform: canvasTransform.value,
    };
});

/** Root flow: the page blocks and the insertion point as one keyed list for TransitionGroup */
const rootFlowEntries = computed<TDropFlowEntry[]>(() =>
    buildDropFlowEntries(componentsStore.getRootComponents(), rootDropIndex.value, 'root-drop')
);

/**
 * Styles of the Figma mode wrapper — the base scale without the rem compensation, which
 * every BuilderCanvasViewport applies for itself.
 *
 * The transform lives on this inner wrapper, while the outer one carries the min-width of
 * the visual width: putting both on one node would apply the scale twice.
 */
const figmaWrapperStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};

    if (isMounted.value) {
        style.transform = figmaBaseTransform.value;
        style.gap = figmaGap;
    }

    return style;
});
// #endregion

// #region Methods
/**
 * Debounced window resize handler: refits the canvas scale and centers the canvas
 * horizontally. The delay keeps a drag of the window edge from recomputing both on every
 * frame.
 */
const debouncedResize = useDebounceFn(() => {
    handleResize();
    scheduleCanvasCenter('auto');
}, 150);

/**
 * Drops the current selection when the click landed on an empty spot of the canvas.
 *
 * @param event - Click event of the canvas.
 */
function handleCanvasClick(event: MouseEvent): void {
    if (event.target === canvasRef.value) {
        componentsStore.deselectComponent();
    }
}

/**
 * Scrolls to the selected component after a viewport switch.
 * A component hidden on the new viewport (deviceVisibility) is deselected instead.
 */
function scrollToSelectedAfterViewportSwitch(): void {
    const selected = componentsStore.selectedComponent;
    if (!selected) {
        return;
    }

    const component = componentsStore.getComponentById(selected.id);
    if (!component) {
        return;
    }

    const visibility = component.deviceVisibility;
    if (visibility && visibility[canvasStore.viewport] === false) {
        componentsStore.deselectComponent();
        return;
    }

    // Wait for the components to render on the new viewport before scrolling
    setTimeout(() => {
        scrollToComponentOnCanvas(selected.id);
    }, 350);
}

/**
 * Safety net for rolling the transient drag state back: `dragend` arrives both after a
 * successful drop and after a cancellation (Esc, leaving the window), even when the source
 * never ran its own handlers.
 */
function handleDocumentDragEnd(): void {
    canvasStore.finishCanvasDrag();
}
// #endregion

// #region Lifecycle
/**
 * Initializes the canvas on mount: the sheet size is synced with the config before any
 * scale or centering is computed, the dynamic styles are switched on only once the first
 * render is out, and the listeners are attached after those styles have been applied.
 */
onMounted(async () => {
    // Sheet size synced with the config before the scale and the centering are computed
    canvasStore.initCanvasSize();

    // Wait for the DOM to be fully ready
    await nextTick();

    // The flag that turns the dynamic styles on
    isMounted.value = true;

    // Initialization once the styles have been applied
    await nextTick();

    window.addEventListener('resize', debouncedResize);
    document.addEventListener('dragend', handleDocumentDragEnd);
    handleResize();
    updateContainerMetrics();
    scheduleCanvasCenter('auto');

    // Track size changes of the container
    initMetricsObserver();

    // Subscribe to the drag and drop events of layout components
    if (canvasRef.value) {
        canvasRef.value.addEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.addEventListener('slot-drop', handleSlotDrop as EventListener);
    }
});

/**
 * Releases the resources on unmount (the ResizeObserver and the centering rAF are cleaned
 * up by their own composables).
 */
onBeforeUnmount(() => {
    window.removeEventListener('resize', debouncedResize);
    document.removeEventListener('dragend', handleDocumentDragEnd);
    canvasStore.finishCanvasDrag();
    if (canvasRef.value) {
        canvasRef.value.removeEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.removeEventListener('slot-drop', handleSlotDrop as EventListener);
    }
});
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderCanvas">
        <div
            ref="canvasContainer"
            :class="[
                $style.canvasArea,
                { [$style.canvasAreaPanning]: isPanning },
                'bricks-scrollbox',
            ]"
            :style="canvasContainerStyle"
            @pointerdown="handleCanvasAreaPointerDown"
        >
            <div
                v-if="canvasStore.isFigmaMode"
                :class="$style.figmaOuter"
                :style="isMounted ? { minWidth: figmaWrapperMinWidth } : undefined"
            >
                <div
                    :class="$style.figmaWrapper"
                    :style="figmaWrapperStyle"
                    data-canvas-zoom-target="true"
                >
                    <BuilderCanvasViewport
                        v-for="device in canvasStore.devices"
                        :key="device.key"
                        :viewport="device.key"
                    />
                </div>
            </div>

            <div
                v-else
                :class="$style.canvasWrapper"
                :style="isMounted ? canvasWrapperStyle : undefined"
            >
                <div
                    ref="canvasRef"
                    :class="[$style.canvas, 'bricks-canvas']"
                    :style="canvasStyle"
                    :data-bricks-viewport="canvasStore.viewport"
                    data-canvas-area="true"
                    data-canvas-zoom-target="true"
                    @drop="handleCanvasDrop"
                    @dragover="handleCanvasDragOver"
                    @click="handleCanvasClick"
                >
                    <div :class="$style.screenContent">
                        <div
                            ref="containerRef"
                            :style="{
                                minHeight: convertPxToRem(canvasStore.height),
                                position: 'relative',
                            }"
                            data-root-drop-zone="true"
                            @dragenter="handleRootDragEnter"
                            @dragover="handleRootDragOver"
                            @dragleave="handleRootDragLeave"
                        >
                            <TransitionGroup name="bricks-canvas-flow">
                                <template v-for="entry in rootFlowEntries" :key="entry.key">
                                    <BuilderCanvasDropPlaceholder
                                        v-if="entry.kind === 'placeholder'"
                                        :contained="isRootPlaceholderContained"
                                    />

                                    <BuilderCanvasItem v-else :component="entry.component" />
                                </template>
                            </TransitionGroup>
                        </div>
                    </div>

                    <BuilderCanvasEmptyState
                        v-if="componentsStore.sortedComponents.length === 0 && !isCanvasDragActive"
                    />
                </div>
            </div>
        </div>

        <BuilderCanvasBottomBar
            :scale="canvasStore.scale"
            :viewport="canvasStore.viewport"
            :sidebar-offset="leftSidebarOffset"
            :right-sidebar-offset="rightSidebarOffset"
            :is-figma-mode="canvasStore.isFigmaMode"
            @zoom-in="zoomInAtCenter"
            @zoom-out="zoomOutAtCenter"
            @zoom-reset="resetZoom"
            @update:viewport="canvasStore.setViewport"
            @toggle-figma-mode="canvasStore.toggleFigmaMode"
        />

        <BuilderCanvasInlineEditingOverlay />
    </div>
</template>

<style module lang="scss">
.TheBuilderCanvas {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
    flex-direction: column;
}

.canvasArea {
    position: relative;
    overflow: auto;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    flex: 1;
}

.canvasAreaPanning {
    cursor: grabbing;
}

.canvasWrapper {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: max-content;
    margin: 0 auto;
    padding: 6rem 0;
}

.figmaOuter {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: max-content;
    margin: 2rem auto 0;
}

.figmaWrapper {
    display: flex;
    align-items: flex-start;
    width: max-content;
    padding: 10rem 0;
    transform-origin: top center;
}

.canvas {
    position: relative;
    overflow: visible;
    flex-shrink: 0;
    margin-top: 2rem;
    border-radius: var(--bricks-border-radius-xs);
    background-color: var(--bricks-base-0);
    transform-origin: top center;
    transition: transform 250ms ease;
    box-shadow: var(--bricks-shadow-md);
    container-type: inline-size;
    container-name: bricks;
}

.screenContent {
    position: relative;
    width: 100%;
}
</style>
