<script setup lang="ts">
// #region Imports
// Types
import type { IBlockGridProps, TGridLayoutVariant, TGridRowHeight } from '../types/blockProps';

// Vue
import {
    computed,
    ref,
    inject,
    nextTick,
    onMounted,
    onBeforeUnmount,
    watch,
    useCssModule,
    type Ref,
    type Slot,
} from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { calculateGridDropTargetIndex } from '../utils/gridDropPlacement';
import { countSlotContent } from '../utils/slotContent';

// Composables
import { useLayoutDropZone } from '../composables/useLayoutDropZone';

// Components
import BlockGridOverlay from './BlockGridOverlay.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockGridProps>(), {});

const slots = defineSlots<{
    default?: Slot;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
const styles = useCssModule();
const gridRef = ref<HTMLElement | null>(null);
const containerSize = ref({ width: 0, height: 0 });

/** Grid is at capacity and a drop is impossible (visual feedback) */
const isGridFull = ref(false);

/** Actual grid row sizes measured from the DOM */
const actualRowSizes = ref<number[]>([]);
// #endregion

// #region Computed

const childCount = computed<number>(() => countSlotContent(slots.default?.()));

const normalizedColumns = computed<number>(() => {
    if (!props.layoutProps.columns || props.layoutProps.columns < 1) {
        return 1;
    }
    return Math.floor(props.layoutProps.columns);
});

const normalizedRows = computed<number>(() => {
    if (!props.layoutProps.rows || props.layoutProps.rows < 1) {
        return 1;
    }
    return Math.floor(props.layoutProps.rows);
});

const accentSpan = computed<number>(() => Math.max(1, Math.round(normalizedColumns.value / 2)));

const gridVariant = computed<TGridLayoutVariant>(() => props.layoutProps.variant ?? 'default');

const gridAutoFlow = computed<string>(() =>
    gridVariant.value === 'default' ? 'row' : 'row dense'
);

const normalizedGap = computed<number>(() => Math.max(0, Number(props.layoutProps.gap) || 0));

const rowHeight = computed<TGridRowHeight>(() => props.layoutProps.rowHeight ?? 'auto');

const minRowHeight = computed<number>(() =>
    Math.max(0, Number(props.layoutProps.minRowHeight) || 0)
);

const DEFAULT_GRID_MIN_HEIGHT = '10rem';

/**
 * Floor height of an unfilled grid row on the canvas. Without it, rows that are
 * declared but not yet taken by content collapse to zero.
 */
const EMPTY_ROW_MIN_HEIGHT = '4rem';

/**
 * How many rows are already taken by content. Auto-placement fills the grid row by
 * row, so the estimate goes by the number of children; an item spanning several
 * cells (the bento variants) makes the estimate too low — such a row gets the floor,
 * but for content taller than 4rem `minmax` behaves like `auto` and the layout is
 * unchanged.
 */
const occupiedRows = computed<number>(() =>
    Math.min(normalizedRows.value, Math.ceil(childCount.value / normalizedColumns.value))
);

/**
 * Builds the gridTemplateRows value out of the current settings.
 */
function buildGridTemplateRows(): string {
    const rows = normalizedRows.value;
    const height = rowHeight.value;
    const minHeight = minRowHeight.value;

    if (minHeight > 0) {
        const minValue = `${minHeight}rem`;
        const maxValue = height === '1fr' ? '1fr' : 'auto';
        return `repeat(${rows}, minmax(${minValue}, ${maxValue}))`;
    }

    // Rows without content have zero height while the gap between them stays: six
    // declared rows do not fit into the block min-height, and the canvas shows a
    // single row instead of the declared ones — there is nowhere to drop a component
    // into the third row. A height floor makes the declared structure visible; taken
    // rows stay on `auto` so that the canvas does not lie about the height of the
    // content. The published page is untouched by this: there empty rows draw
    // nothing, and rendering goes through separate code (renderPublished in the
    // definition).
    const filled = occupiedRows.value;
    if (filled >= rows) {
        return `repeat(${rows}, ${height})`;
    }

    const emptyTracks = `repeat(${rows - filled}, minmax(${EMPTY_ROW_MIN_HEIGHT}, auto))`;
    return filled > 0 ? `repeat(${filled}, ${height}) ${emptyTracks}` : emptyTracks;
}

const normalizedPaddingX = computed<number>(
    () => Math.round(Math.max(0, Number(props.layoutProps.paddingX) || 0) * 10) / 10
);
const normalizedPaddingY = computed<number>(
    () => Math.round(Math.max(0, Number(props.layoutProps.paddingY) || 0) * 10) / 10
);

const gridStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {
        display: 'grid',
        gridTemplateColumns: `repeat(${normalizedColumns.value}, 1fr)`,
        gridTemplateRows: buildGridTemplateRows(),
        gridAutoRows: minRowHeight.value > 0 ? `minmax(${minRowHeight.value}rem, auto)` : 'auto',
        gap: convertPxToRem(normalizedGap.value),
        width: '100%',
        position: 'relative',
        pointerEvents: 'auto',
        gridAutoFlow: gridAutoFlow.value,
        alignItems: 'stretch',
        minHeight: DEFAULT_GRID_MIN_HEIGHT,
        '--bricks-grid-accent-span': String(accentSpan.value),
    };

    const px = normalizedPaddingX.value;
    const py = normalizedPaddingY.value;

    if (px > 0 || py > 0) {
        style.padding = `${py}rem ${px}rem`;
    }

    return style;
});

const overlayStyle = computed<Record<string, string>>((): Record<string, string> => {
    const px = normalizedPaddingX.value;
    const py = normalizedPaddingY.value;

    if (px > 0 || py > 0) {
        return {
            top: `${py}rem`,
            left: `${px}rem`,
        };
    }

    return {};
});
// #endregion

// #region Methods
/**
 * Synchronizes internal container size with DOM measurements.
 * Computes the content area (without padding) so the overlay lines up.
 * Also extracts actual row sizes from computed grid style.
 */
function updateSize(): void {
    if (gridRef.value) {
        const computedStyle = window.getComputedStyle(gridRef.value);
        const padLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const padRight = parseFloat(computedStyle.paddingRight) || 0;
        const padTop = parseFloat(computedStyle.paddingTop) || 0;
        const padBottom = parseFloat(computedStyle.paddingBottom) || 0;

        containerSize.value = {
            width: gridRef.value.offsetWidth - padLeft - padRight,
            height: gridRef.value.offsetHeight - padTop - padBottom,
        };

        // Read the actual row sizes out of the CSS Grid
        const gridRowSizes = computedStyle.gridTemplateRows;

        if (gridRowSizes && gridRowSizes !== 'none') {
            // Parse values like "100px 200px 150px" into an array of numbers
            const sizes = gridRowSizes
                .split(/\s+/)
                .map((size) => parseFloat(size))
                .filter((size) => !Number.isNaN(size) && size > 0);

            actualRowSizes.value = sizes;
        } else {
            actualRowSizes.value = [];
        }
    }
}

/**
 * Returns the number of child items in the grid.
 */
function getCurrentChildCount(): number {
    if (!gridRef.value) {
        return 0;
    }
    return gridRef.value.querySelectorAll(':scope > [data-layout-drop-item]').length;
}

/**
 * Checks whether the grid is filled to its maximum capacity (rows × columns).
 */
function checkGridAtCapacity(): boolean {
    const maxItems = normalizedRows.value * normalizedColumns.value;
    return getCurrentChildCount() >= maxItems;
}

/**
 * Checks whether the component being dragged is a child of this grid.
 */
function isChildOfThisGrid(componentId: string): boolean {
    if (!gridRef.value) {
        return false;
    }

    return (
        gridRef.value.querySelector(
            `:scope > [data-layout-drop-item][data-component-id="${CSS.escape(componentId)}"]`
        ) !== null
    );
}

/**
 * Capacity check on dragover. During dragover the data in dataTransfer cannot be
 * read (security), but its types can be inspected. A `component-id` type means an
 * existing component is being moved (possibly inside this very grid → swap). Only
 * adding a new component from the library is blocked while the grid is full.
 *
 * @param event - Browser dragover event.
 */
function canAcceptGridDragOver(event: DragEvent): boolean {
    const types = Array.from(event.dataTransfer?.types || []);
    const isExistingComponent = types.includes('component-id');

    if (!isExistingComponent && checkGridAtCapacity()) {
        isGridFull.value = true;
        return false;
    }

    isGridFull.value = false;
    return true;
}

/**
 * Capacity check on drop: a full grid only allows its own children to be moved
 * around (an internal swap does not change the capacity).
 *
 * @param _event - Browser drop event (unused).
 * @param movedComponentId - ID of the component being moved, or null for a new one.
 */
function canAcceptGridDrop(_event: DragEvent, movedComponentId: string | null): boolean {
    if (!checkGridAtCapacity()) {
        return true;
    }

    if (movedComponentId && isChildOfThisGrid(movedComponentId)) {
        return true;
    }

    console.warn('[BlockGrid] Grid is at capacity, ignoring drop');
    return false;
}

/**
 * Clears the grid-is-full flag.
 */
function clearGridFull(): void {
    isGridFull.value = false;
}

/**
 * Computes the targetIndex (the grid cell) from the cursor position.
 */
function calculateDropTargetIndex(event: DragEvent): number | null {
    return calculateGridDropTargetIndex(
        event,
        gridRef.value,
        normalizedColumns.value,
        normalizedRows.value
    );
}

/**
 * Pins the insertion point to the target cell outside the grid flow.
 *
 * An ordinary flow placeholder becomes one more grid item here: with a full grid,
 * auto-placement added an implicit row, the grid grew, and the geometry moved with
 * it — the cell computed under the cursor started coming out wrong. An absolutely
 * positioned element is placed by its own grid-area and does not affect the layout.
 *
 * @param targetIndex - Index of the cell under the cursor.
 * @returns Inline styles of the placeholder (kebab-case).
 */
function resolvePlaceholderCell(targetIndex: number): Record<string, string> {
    const columns = normalizedColumns.value;

    // A new component lands at the end of the children list: both insertion points
    // in the store (addChildToLayout, moveComponentToLayout) clamp the index to their
    // count. The placeholder has to point at that same cell — otherwise it promises
    // the sixth row of an empty grid while the component appears in the first.
    const cellIndex = Math.min(targetIndex, childCount.value);

    // The span is mandatory: for an absolutely positioned grid child the end of the
    // area is tied to the container edge by default, and the placeholder stretched
    // down to the bottom of the grid.
    return {
        position: 'absolute',
        'grid-column': `${(cellIndex % columns) + 1} / span 1`,
        'grid-row': `${Math.floor(cellIndex / columns) + 1} / span 1`,
        inset: '0',
        width: 'auto',
        height: 'auto',
    };
}
// #endregion

// #region Drop zone
const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useLayoutDropZone({
        containerRef: gridRef,
        layoutId: () => props.layoutId,
        canAcceptDragOver: canAcceptGridDragOver,
        canAcceptDrop: canAcceptGridDrop,
        resolveDropIndex: calculateDropTargetIndex,
        requireDropIndex: true,
        onReset: clearGridFull,
        extraDropDetail: { swap: true },
        placeholderClass: styles.dropPlaceholder,
        resolvePlaceholderStyle: resolvePlaceholderCell,
    });
// #endregion

// #region Lifecycle
onMounted(() => {
    updateSize();
    window.addEventListener('resize', updateSize);

    const resizeObserver = new ResizeObserver(updateSize);
    if (gridRef.value) {
        resizeObserver.observe(gridRef.value);
    }

    onBeforeUnmount(() => {
        window.removeEventListener('resize', updateSize);
        resizeObserver.disconnect();
    });
});
// #endregion

// #region Watchers
// The grid underlay is drawn from MEASURED tracks, and the measurement is refreshed
// only by a window resize and by the ResizeObserver. Changing the number of rows or
// the row height does not change the outer size of the block (min-height holds it),
// so without this recalculation the underlay keeps the previous value: the panel
// shows one row while the canvas still shows the previous four. Columns are in the
// list for the same reason: changing their number re-flows the children and changes
// the row heights, yet the sum of those heights may stay the same — and then the size
// observer says nothing.
watch(
    [normalizedRows, normalizedColumns, rowHeight, minRowHeight, normalizedGap, childCount],
    async () => {
        await nextTick();
        updateSize();
    }
);
// #endregion
</script>

<template>
    <div
        ref="gridRef"
        :class="[
            $style.BlockGrid,
            {
                [$style.dragOver]: isDragOver,
                [$style.gridHidden]: !showGrid,
                [$style.gridFull]: isGridFull,
            },
        ]"
        :style="gridStyle"
        :data-grid-variant="gridVariant"
        data-layout-drop-zone="true"
        :data-layout-id="layoutId ?? null"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <BlockGridOverlay
            v-if="showGrid && containerSize.width > 0"
            :style="overlayStyle"
            :container-size="containerSize"
            :columns="normalizedColumns"
            :gap="normalizedGap"
            :row-sizes="actualRowSizes"
        />

        <slot />
    </div>
</template>

<style module lang="scss">
.BlockGrid {
    --bricks-grid-accent-span: 2;

    position: relative;
    min-width: 0;
    border: 1px dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

    > :global([data-layout-drop-item='true']) {
        overflow: hidden;
        min-width: 0;
        min-height: 0;
        grid-row: span 1;
    }

    &:hover {
        border-color: var(--bricks-primary);
        background: color-mix(in srgb, var(--bricks-primary) 6%, var(--bricks-base-50));
    }

    &.dragOver[data-layout-drop-active='true'] {
        border-color: var(--bricks-primary);
        background: color-mix(in srgb, var(--bricks-primary) 6%, var(--bricks-base-50));
        box-shadow: var(--bricks-canvas-ring-active);
    }

    &.gridFull {
        border-color: color-mix(in srgb, var(--bricks-danger-500) 60%, transparent);
        border-style: dashed;
        background: color-mix(in srgb, var(--bricks-danger-500) 8%, var(--bricks-base-50));
        box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--bricks-danger-500) 60%, transparent);
        cursor: not-allowed;
    }

    &[data-grid-variant='lead-left'],
    &[data-grid-variant='lead-right'] {
        grid-auto-flow: dense;
    }

    &[data-grid-variant='lead-left'] {
        > :global([data-layout-drop-item='true']:nth-of-type(1)) {
            grid-column: span var(--bricks-grid-accent-span, 2);
        }
    }

    &[data-grid-variant='lead-right'] {
        > :global([data-layout-drop-item='true']:nth-last-of-type(1)) {
            grid-column: span var(--bricks-grid-accent-span, 2);
        }
    }
}

.gridHidden {
    border-color: transparent;
    background: transparent;

    &:hover {
        border-color: transparent;
        background: transparent;
        box-shadow: none;
    }
}

.dropPlaceholder {
    box-sizing: border-box;
    align-self: stretch;
    width: 100%;
    height: var(--bricks-drag-placeholder-height);
    border: 0.2rem dashed var(--bricks-primary);
    background: color-mix(in srgb, var(--bricks-primary) 7%, transparent);
    pointer-events: none;
}
</style>
