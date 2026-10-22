<script setup lang="ts">
// #region Imports
// Types
import type { ICanvasViewportProps, IDragComposableCanvas } from '../../types/components';
import type { TBricksDeviceKey } from '../../../../common/types/brick';
import type { TDropFlowEntry } from '../../../core/types/drag';

// Vue
import { computed, ref, inject, provide, onMounted, onBeforeUnmount, nextTick } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';
import { usePublishStore } from '../../../publish/stores/publish';

// Composables
import { useBricksConfig } from '../../../../common/composables/useBricksConfig';
import { useCanvasDrops } from '../composables/useCanvasDrops';
import { useCanvasDropGuard } from '../composables/useCanvasDropGuard';
import { useCanvasFlowGuard } from '../composables/useCanvasFlowGuard';
import { useCanvasComponentTreeWatch } from '../composables/useCanvasComponentTreeWatch';

// Constants
import { DEFAULT_CANVAS_HEIGHT } from '../../../../common/constants/devices';
import { CANVAS_VIEWPORT_KEY } from '../../../../common/constants/injectionKeys';

// Utils
import { convertPxToRem } from '../../../../common/utils/main';
import { buildDropFlowEntries, getDragPlaceholderVars } from '../../../core/utils/dragVisuals';
import {
    measureCanvasContentHeight,
    resolveContentDrivenCanvasHeight,
} from '../../../core/utils/canvasHeight';

// Components
import BuilderCanvasItem from '../../item/components/BuilderCanvasItem.vue';
import BuilderCanvasDropPlaceholder from './BuilderCanvasDropPlaceholder.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ICanvasViewportProps>(), {});
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const publishStore = usePublishStore();
const config = useBricksConfig();

const dragComposable = inject<IDragComposableCanvas | undefined>('dragComposable');
const getRemCompensation = inject<((viewport: TBricksDeviceKey) => number) | undefined>(
    'getRemCompensation'
);

/**
 * Provides the viewport to child BuilderCanvasItem components (Figma mode; the nearest
 * provider wins).
 */
provide(
    CANVAS_VIEWPORT_KEY,
    computed(() => props.viewport)
);

/**
 * The rule of a permitted move for the zones of THIS sheet: the capacity of a Grid is
 * counted in the cells of its own viewport, so a sheet must not be judged by the viewport
 * the canvas store considers active.
 */
useCanvasDropGuard(() => props.viewport);

const canvasRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

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

let containerResizeObserver: ResizeObserver | null = null;

// Figma mode: the scale is shared by every viewport, so the flow transitions are silenced
// here just as they are on the normal canvas.
useCanvasFlowGuard(canvasRef);
// #endregion

// #region Computed
/** Device of the set this sheet belongs to */
const device = computed(() => canvasStore.devices.find((item) => item.key === props.viewport));

const viewportWidth = computed<number>(() => canvasStore.getViewportWidth(props.viewport));

const viewportHeight = ref<number>(DEFAULT_CANVAS_HEIGHT);

/** Rem compensation of this sheet: the uniform scale that renders its rem base */
const compensation = computed<number>(() => getRemCompensation?.(props.viewport) ?? 1);

/**
 * Box of the sheet in the row: its visual size, the compensation applied.
 *
 * A transform leaves the layout box as it was, so a sheet scaled by its compensation used
 * to take its unscaled width in the row. The width the canvas computes for the row
 * (`getFigmaContentWidth`) counts the visual one, and the two parted by
 * `width × (1 − compensation)` per sheet: the row overflowed the scroll area
 * symmetrically, and its left edge went where no scrolling reaches — by 148px of a
 * 1024px sheet at a compensation of 0.71, times the zoom. The gaps around such a sheet
 * grew by the same amount, and a compensation above 1 made sheets overlap instead.
 */
const frameStyle = computed<Record<string, string>>(() => ({
    width: convertPxToRem(viewportWidth.value * compensation.value),
    height: convertPxToRem(viewportHeight.value * compensation.value),
}));

/**
 * Width of the item of the row: the visual width of the sheet, whatever the label.
 *
 * As an item of auto width the root took the widest of its children, and the label is a
 * name from the device set of any length: a label wider than its sheet widened the item
 * past what `getFigmaContentWidth` counts and brought back the unreachable left edge.
 * The name is clipped to the sheet instead (`viewportName`).
 */
const viewportStyle = computed<Record<string, string>>(() => ({
    width: frameStyle.value.width,
}));

const canvasStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {
        width: convertPxToRem(viewportWidth.value),
        height: convertPxToRem(viewportHeight.value),
        backgroundColor: publishStore.currentFormState.backgroundColor || 'var(--bricks-base-0)',
        fontFamily: config.defaultFont,
        ...getDragPlaceholderVars(canvasStore.dragState),
    };

    if (compensation.value !== 1) {
        style.transform = `scale(${compensation.value})`;
        style.transformOrigin = 'top left';
    }

    return style;
});

/** Root flow: the page blocks and the insertion point as one keyed list for TransitionGroup */
const rootFlowEntries = computed<TDropFlowEntry[]>(() =>
    buildDropFlowEntries(componentsStore.getRootComponents(), rootDropIndex.value, 'root-drop')
);

/**
 * Name of the sheet, taken from the device set: the names Mobile/Tablet/Desktop are gone
 * from the code — a device may be called anything and may be the fourth one.
 *
 * A name wider than the sheet ends in an ellipsis, while the width after it stays whole;
 * on a sheet too narrow even for the width (a tiny rem base) the label is cut at the edge
 * of the sheet. The label stays on one line, because the row aligns the sheets by their
 * top and a wrapped label would push its sheet below the others. The full label is the
 * tooltip.
 *
 * Its color is `--bricks-workspace-fg`; why that role and not a step of the palette is
 * explained where the variable is declared (`assets/scss/shared/_variables.scss`).
 */
const viewportName = computed<string>(() => device.value?.label ?? props.viewport);

/** Width part of the label, never clipped */
const viewportWidthLabel = computed<string>(() => `— ${viewportWidth.value}px`);

/** Full label of the sheet: the name and the width */
const viewportLabel = computed<string>(() => `${viewportName.value} ${viewportWidthLabel.value}`);
// #endregion

// #region Methods
/**
 * Syncs the height of the sheet with the actual content.
 *
 * The height of a sheet is local and not the one of the store: Figma mode draws every
 * viewport at once, and each of them measures its own content. The policy itself is
 * shared with the normal canvas.
 */
function updateViewportHeight(): void {
    const container = containerRef.value;
    if (!container) {
        return;
    }

    viewportHeight.value = resolveContentDrivenCanvasHeight(
        canvasStore.getViewportHeight(props.viewport),
        measureCanvasContentHeight(container),
        componentsStore.hasComponents
    );
}

/**
 * Handles a click on the canvas: drops the selection.
 *
 * @param event - Click event.
 */
function handleCanvasClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
        componentsStore.deselectComponent();
    }
}

// #endregion

// #region Lifecycle
// Recomputes the height of the sheet when the component tree changes — the same watcher
// serves the normal canvas
useCanvasComponentTreeWatch(updateViewportHeight);

onMounted(async () => {
    await nextTick();

    updateViewportHeight();

    containerResizeObserver = new ResizeObserver(() => {
        updateViewportHeight();
    });

    if (containerRef.value) {
        containerResizeObserver.observe(containerRef.value);
    }

    if (canvasRef.value) {
        canvasRef.value.addEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.addEventListener('slot-drop', handleSlotDrop as EventListener);
    }
});

onBeforeUnmount(() => {
    if (canvasRef.value) {
        canvasRef.value.removeEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.removeEventListener('slot-drop', handleSlotDrop as EventListener);
    }
    if (containerResizeObserver && containerRef.value) {
        containerResizeObserver.unobserve(containerRef.value);
    }
    containerResizeObserver?.disconnect();
    containerResizeObserver = null;
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderCanvasViewport" :style="viewportStyle">
        <div :class="$style.label" :title="viewportLabel">
            <span :class="$style.labelName">{{ viewportName }}</span>
            <span :class="$style.labelWidth">{{ viewportWidthLabel }}</span>
        </div>

        <div :class="$style.frame" :style="frameStyle">
            <div
                ref="canvasRef"
                :class="[$style.canvas, 'bricks-canvas']"
                :style="canvasStyle"
                :data-bricks-viewport="props.viewport"
                data-canvas-area="true"
                @drop="handleCanvasDrop"
                @dragover="handleCanvasDragOver"
                @click="handleCanvasClick"
            >
                <div :class="$style.screenContent">
                    <div
                        ref="containerRef"
                        :style="{
                            minHeight: convertPxToRem(viewportHeight),
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
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderCanvasViewport {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
}

.label {
    overflow: hidden;
    display: flex;
    max-width: 100%;
    margin-bottom: 0.8rem;
    column-gap: 0.6rem;
    text-transform: uppercase;
    white-space: nowrap;
    font-size: 2.4rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-workspace-fg);
}

.labelName {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
}

.labelWidth {
    flex-shrink: 0;
}

.frame {
    flex-shrink: 0;
}

.canvas {
    position: relative;
    overflow: visible;
    border-radius: var(--bricks-border-radius-xs);
    background-color: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-md);
    container-type: inline-size;
    container-name: bricks;
}

.screenContent {
    position: relative;
    width: 100%;
}
</style>
