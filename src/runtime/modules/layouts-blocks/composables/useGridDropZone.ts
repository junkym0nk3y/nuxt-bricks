// #region Imports
// Types
import type { IGridDropZone, IGridDropZoneOptions } from '../types/dropZone';

// Vue
import { ref, toValue } from 'vue';

// Utils
import { calculateGridDropTargetIndex } from '../utils/gridDropPlacement';

// Composables
import { useLayoutDropZone } from './useLayoutDropZone';
// #endregion

/**
 * The drop zone of a Grid block: everything that makes a fixed set of cells behave
 * differently from a flow zone — the capacity checks and the placeholder pinned to a
 * cell — plus the shared zone underneath.
 *
 * The dimensions are read through `toValue` at the moment of the event rather than
 * captured at setup: they carry responsive overrides, and a Figma-mode board holds one
 * grid per viewport at the same time.
 *
 * @param options - Root of the grid, its dimensions and the placeholder class.
 */
export function useGridDropZone(options: IGridDropZoneOptions): IGridDropZone {
    // #region Data
    const isGridFull = ref(false);
    // #endregion

    // #region Methods
    /**
     * Counts the children of the grid in the DOM.
     *
     * Capacity is answered by the DOM and not by the slot count on purpose: the cells are
     * taken by what is actually mounted, and that is also what an internal move reshuffles.
     */
    function getCurrentChildCount(): number {
        return (
            options.containerRef.value?.querySelectorAll(':scope > [data-layout-drop-item]')
                .length ?? 0
        );
    }

    /**
     * Checks whether the grid is filled to its maximum capacity (rows × columns).
     */
    function checkGridAtCapacity(): boolean {
        const maxItems = toValue(options.rows) * toValue(options.columns);
        return getCurrentChildCount() >= maxItems;
    }

    /**
     * Checks whether the component being dragged is a child of this grid.
     *
     * @param componentId - ID of the component being moved.
     */
    function isChildOfThisGrid(componentId: string): boolean {
        const container = options.containerRef.value;
        if (!container) {
            return false;
        }

        return (
            container.querySelector(
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

    const dropZone = useLayoutDropZone({
        containerRef: options.containerRef,
        layoutId: options.layoutId,
        canAcceptDragOver: canAcceptGridDragOver,
        canAcceptDrop: canAcceptGridDrop,
        resolveDropIndex: resolveGridDropIndex,
        requireDropIndex: true,
        onReset: clearGridFull,
        extraDropDetail: { swap: true },
        placeholderClass: options.placeholderClass,
        resolvePlaceholderStyle: resolvePlaceholderCell,
    });

    return { ...dropZone, isGridFull };
}
