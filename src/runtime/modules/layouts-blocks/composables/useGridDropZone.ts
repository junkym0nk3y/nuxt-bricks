// #region Imports
// Types
import type { IGridDropZoneOptions, ILayoutDropZone } from '../types/dropZone';

// Vue
import { toValue } from 'vue';

// Utils
import { calculateGridDropTargetIndex } from '../utils/gridDropPlacement';

// Composables
import { useLayoutDropZone } from './useLayoutDropZone';
// #endregion

/**
 * The drop zone of a Grid block: everything that makes a fixed set of cells behave
 * differently from a flow zone — the cell under the cursor and the placeholder pinned to
 * it — plus the shared zone underneath.
 *
 * Capacity is not part of it. Whether one more child fits is answered by the host, which
 * counts the cells of the schema for the viewport it draws; a count of its own here read
 * the mounted DOM nodes, and the two disagree on a dangling child id, on a schema
 * mutation the DOM has not caught up with and on any payload the zone classifies
 * differently. The refusal reaches the block as the mark on its own element.
 *
 * The dimensions are read through `toValue` at the moment of the event rather than
 * captured at setup: they carry responsive overrides, and a Figma-mode board holds one
 * grid per viewport at the same time.
 *
 * @param options - Root of the grid, its dimensions and the placeholder class.
 */
export function useGridDropZone(options: IGridDropZoneOptions): ILayoutDropZone {
    // #region Methods
    /**
     * Computes the targetIndex (the grid cell) from the cursor position.
     *
     * @param event - Browser drag event.
     */
    function resolveGridDropIndex(event: DragEvent): number | null {
        return calculateGridDropTargetIndex(
            event,
            options.containerRef.value,
            toValue(options.columns),
            toValue(options.rows)
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
        const columns = toValue(options.columns);

        // A new component lands at the end of the children list: both insertion points
        // in the store (addChildToLayout, moveComponentToLayout) clamp the index to their
        // count. The placeholder has to point at that same cell — otherwise it promises
        // the sixth row of an empty grid while the component appears in the first.
        const cellIndex = Math.min(targetIndex, toValue(options.renderedChildCount));

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

    return useLayoutDropZone({
        containerRef: options.containerRef,
        layoutId: options.layoutId,
        resolveDropIndex: resolveGridDropIndex,
        requireDropIndex: true,
        extraDropDetail: { swap: true },
        placeholderClass: options.placeholderClass,
        resolvePlaceholderStyle: resolvePlaceholderCell,
    });
}
