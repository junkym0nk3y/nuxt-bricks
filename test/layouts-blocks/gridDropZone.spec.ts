/**
 * @vitest-environment happy-dom
 *
 * The cell of the placeholder — what is left of the drop zone of a Grid once capacity is
 * no longer its business.
 *
 * TWO different counts of children used to live inside that zone: capacity counted the
 * mounted DOM nodes, while the ceiling of the placeholder cell counts the slot nodes,
 * because those are what both insertion points in the store clamp the index to. Capacity
 * is now answered by the host out of the schema and the viewport it draws, and the count
 * that stayed is the one below — the numbers disagree on purpose here, with equal numbers
 * a swap of one for the other would go unnoticed.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { ref } from 'vue';

// Composables
import { useGridDropZone } from '../../src/runtime/modules/layouts-blocks/composables/useGridDropZone';
// #endregion

/**
 * Builds a grid with the given number of mounted children and a fixed geometry.
 *
 * happy-dom lays nothing out: the rectangle is set by hand, and `getComputedStyle` reports
 * empty tracks, so the cell calculation takes its equal-bands branch — which is all these
 * cases need.
 *
 * @param childCount - How many children are mounted in the DOM.
 * @param height - Height of the grid in pixels.
 * @returns Root element of the grid.
 */
function buildGrid(childCount: number, height = 400): HTMLElement {
    document.body.innerHTML = '<div id="grid"></div>';
    const grid = document.getElementById('grid') as HTMLElement;

    grid.innerHTML = Array.from(
        { length: childCount },
        (_unused, index) =>
            `<div data-layout-drop-item="true" data-component-id="child-${index}"></div>`
    ).join('');

    grid.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 100, height, right: 100, bottom: height }) as DOMRect;

    return grid;
}

/**
 * Builds a drag event carrying the required payload type.
 *
 * @param types - dataTransfer types: `component-id` means an existing block is moved.
 * @param movedComponentId - What `getData` answers on drop.
 * @param clientY - Vertical coordinate of the cursor.
 * @returns The event and the dataTransfer the zone writes its answer into.
 */
function createDragEvent(
    types: string[],
    movedComponentId = '',
    clientY = 0
): { event: DragEvent; dataTransfer: { dropEffect: string } } {
    const dataTransfer = {
        types,
        dropEffect: '',
        getData: () => movedComponentId,
    };

    const event = Object.assign(new Event('dragover'), {
        clientX: 0,
        clientY,
        dataTransfer,
    }) as unknown as DragEvent;

    return { event, dataTransfer };
}

describe('drop zone of a grid', () => {
    beforeEach(() => {
        // inject and onBeforeUnmount outside setup() — Vue warnings unrelated to the subject
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('clamps the placeholder cell to the slot children, not the cell under the cursor', () => {
        // Three mounted nodes against one slot node: the numbers disagree on purpose,
        // otherwise clamping by the wrong count would give the same answer
        const grid = buildGrid(3);
        const { handleDragOver } = useGridDropZone({
            containerRef: ref(grid),
            layoutId: () => 'layout-1',
            columns: 1,
            rows: 4,
            renderedChildCount: 1,
            placeholderClass: 'gridPlaceholder',
        });

        // The cursor sits in the fourth band of four: unclamped, the placeholder would
        // promise row 4, while a new block lands right after the slot content — in row 2
        handleDragOver(createDragEvent(['application/json'], '', 350).event);

        const placeholder = grid.querySelector<HTMLElement>('[data-layout-drop-destination]');

        expect(placeholder?.style.getPropertyValue('grid-row')).toBe('2 / span 1');
        expect(placeholder?.style.getPropertyValue('grid-column')).toBe('1 / span 1');
    });

    it('hands the cell under the cursor to the drop and marks it as a swap', () => {
        const grid = buildGrid(2);
        const details: Array<Record<string, unknown>> = [];
        grid.addEventListener('layout-drop', (event) => {
            details.push((event as CustomEvent).detail);
        });

        const { handleDrop } = useGridDropZone({
            containerRef: ref(grid),
            layoutId: () => 'layout-1',
            columns: 1,
            rows: 2,
            renderedChildCount: 2,
        });

        // The lower half of two bands: the second cell of the column
        handleDrop(createDragEvent(['component-id'], 'child-0', 350).event);

        expect(details).toHaveLength(1);
        // A Grid trades places instead of shifting the row: the cell of the target is
        // taken by the arriving component and the two swap
        expect(details[0]).toMatchObject({ targetIndex: 1, swap: true });
    });
});
