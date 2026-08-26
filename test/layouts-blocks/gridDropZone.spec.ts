/**
 * @vitest-environment happy-dom
 *
 * The capacity of a grid and the cell of its placeholder — what makes the drop zone of a
 * Grid different from a flow one.
 *
 * TWO different counts of children live inside that zone, and swapping one for the other
 * is easy: capacity counts the mounted DOM nodes (the cells are taken by what is actually
 * painted), while the ceiling of the placeholder cell counts the slot nodes, because those
 * are what both insertion points in the store clamp the index to. In the cases below the
 * two numbers disagree on purpose — with equal numbers a swap would go unnoticed.
 *
 * The is-full flag is deliberately not asserted here: a refusal raises it and drops it
 * again within the same event, because `handleDragOver` calls the zone reset on refusal and
 * the reset of a grid is precisely the clearing of that flag. What is observable of a
 * refusal is the `dropEffect` and the absence of an insertion event, and that is what is
 * checked.
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
        // inject and onBeforeUnmount outside setup() — Vue warnings unrelated to the
        // subject; the is-full warning of the zone itself lands here too
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('counts the mounted nodes for capacity, not the slot nodes', () => {
        const grid = buildGrid(2);
        const { handleDragOver } = useGridDropZone({
            containerRef: ref(grid),
            layoutId: () => 'layout-1',
            columns: 1,
            rows: 2,
            // The slot count is zero: were capacity to read it instead of the DOM, a
            // full grid would agree to take one more block
            renderedChildCount: 0,
        });

        const { event, dataTransfer } = createDragEvent(['application/json']);
        handleDragOver(event);

        expect(dataTransfer.dropEffect).toBe('none');
    });

    it('accepts a new block while there is a cell left', () => {
        const grid = buildGrid(1);
        const { handleDragOver } = useGridDropZone({
            containerRef: ref(grid),
            layoutId: () => 'layout-1',
            columns: 1,
            rows: 2,
            renderedChildCount: 1,
        });

        const { event, dataTransfer } = createDragEvent(['application/json']);
        handleDragOver(event);

        expect(dataTransfer.dropEffect).toBe('copy');
    });

    it('reshuffles its own child in a full grid and refuses a stranger', () => {
        const grid = buildGrid(2);
        const drops: Array<number | null> = [];
        grid.addEventListener('layout-drop', (event) => {
            drops.push((event as CustomEvent).detail.targetIndex);
        });

        const { handleDrop } = useGridDropZone({
            containerRef: ref(grid),
            layoutId: () => 'layout-1',
            columns: 1,
            rows: 2,
            renderedChildCount: 2,
        });

        handleDrop(createDragEvent(['component-id'], 'child-0').event);
        expect(drops).toHaveLength(1);

        handleDrop(createDragEvent(['component-id'], 'stranger').event);
        expect(drops).toHaveLength(1);
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
});
