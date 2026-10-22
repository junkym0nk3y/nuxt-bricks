<script setup lang="ts">
// #region Imports
// Types
import type { IBlockGridProps, TGridLayoutVariant, TGridRowHeight } from '../types/blockProps';

// Vue
import { computed, ref, inject, useCssModule, type Ref, type Slot } from 'vue';

// Constants
import { BLOCK_GRID_MIN_HEIGHT } from '../constants/blockGrid';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { normalizeGridTrackCount } from '../utils/gridTracks';
import { countSlotContent } from '../utils/slotContent';

// Composables
import { useGridDropZone } from '../composables/useGridDropZone';
import { useGridOverlayMetrics } from '../composables/useGridOverlayMetrics';

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

/**
 * Floor height of an unfilled grid row on the canvas. Without it, rows that are
 * declared but not yet taken by content collapse to zero.
 */
const EMPTY_ROW_MIN_HEIGHT = '4rem';
// #endregion

// #region Computed

const childCount = computed<number>(() => countSlotContent(slots.default?.()));

const normalizedColumns = computed<number>(() =>
    normalizeGridTrackCount(props.layoutProps.columns)
);

const normalizedRows = computed<number>(() => normalizeGridTrackCount(props.layoutProps.rows));

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
 * The gridTemplateRows value of the canvas grid.
 *
 * Named for its surface, and deliberately not shared with the published counterpart
 * (`buildPublishedGridTemplateRows`): the empty-row floor below belongs to the editor
 * alone, and one function with a mode flag would let an edit to the canvas view change
 * the CSS of a published page.
 *
 * Rows without content have zero height while the gap between them stays: six declared
 * rows do not fit into the block min-height, and the canvas shows a single row instead
 * of the declared ones — there is nowhere to drop a component into the third row. A
 * height floor makes the declared structure visible; taken rows stay on `auto` so that
 * the canvas does not lie about the height of the content. The published page is
 * untouched by this: there empty rows draw nothing, and rendering goes through separate
 * code (renderPublished in the definition).
 */
const canvasGridTemplateRows = computed<string>(() => {
    const rows = normalizedRows.value;
    const height = rowHeight.value;
    const minHeight = minRowHeight.value;

    if (minHeight > 0) {
        const minValue = `${minHeight}rem`;
        const maxValue = height === '1fr' ? '1fr' : 'auto';
        return `repeat(${rows}, minmax(${minValue}, ${maxValue}))`;
    }

    const filled = occupiedRows.value;
    if (filled >= rows) {
        return `repeat(${rows}, ${height})`;
    }

    const emptyTracks = `repeat(${rows - filled}, minmax(${EMPTY_ROW_MIN_HEIGHT}, auto))`;
    return filled > 0 ? `repeat(${filled}, ${height}) ${emptyTracks}` : emptyTracks;
});

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
        gridTemplateRows: canvasGridTemplateRows.value,
        gridAutoRows: minRowHeight.value > 0 ? `minmax(${minRowHeight.value}rem, auto)` : 'auto',
        gap: convertPxToRem(normalizedGap.value),
        width: '100%',
        position: 'relative',
        pointerEvents: 'auto',
        gridAutoFlow: gridAutoFlow.value,
        alignItems: 'stretch',
        minHeight: BLOCK_GRID_MIN_HEIGHT,
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

// #region Drop zone
// The red state of a full grid is not a flag of this component: the zone marks the
// element it refused with `data-layout-drop-refusal`, and the stylesheet answers the one
// reason a grid can explain. A flag here used to be raised and dropped inside the same
// event, so the state was never painted; and one layout id has several mounted grids at
// once on a Figma board, where a grid full on mobile still takes a child on desktop.
//
// The rules that erase the frame when the helper grid is switched off exclude a grid
// marked out of cells by hand. They carry the same specificity as the refusal and stand
// later in the file, so without the exclusion the red state would come back invisible on
// exactly the screens where the helper grid is off — the defect fixed here, in another
// disguise. The exclusion names the one reason and not the attribute: a zone marks every
// refusal it receives, and a grid explains one of them. Excluding them all would give a
// grid refused for a reason it does not draw its ordinary frame back — and a hover
// highlight on top of it — that is, the look of a destination that is open.
const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useGridDropZone({
        containerRef: gridRef,
        layoutId: () => props.layoutId,
        columns: normalizedColumns,
        rows: normalizedRows,
        renderedChildCount: childCount,
        placeholderClass: styles.dropPlaceholder,
    });
// #endregion

// #region Overlay metrics
// `gridStyle` already carries every declared source of the track layout — the number of
// rows and columns, the row heights, the gap, the padding and the child count that
// decides which rows count as taken. `gridVariant` is listed on its own because
// lead-left and lead-right produce the very same inline style and differ only in which
// child the stylesheet stretches across two columns, which re-flows the rows.
const { containerSize, rowSizes } = useGridOverlayMetrics({
    containerRef: gridRef,
    remeasureOn: [gridStyle, gridVariant],
});
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
            :row-sizes="rowSizes"
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

    &[data-layout-drop-refusal='grid-capacity'] {
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

.gridHidden:not([data-layout-drop-refusal='grid-capacity']) {
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
