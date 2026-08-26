/**
 * @vitest-environment happy-dom
 *
 * Walking the children by the cursor: one algorithm for every flow drop zone of the
 * canvas.
 *
 * Before it was pulled together the walk stood in five copies (Flex, Section, the
 * slider, the slots of a brick component, the root of the canvas), and the copies had
 * already drifted apart in the shape of the walk — `some` with an assignment, a manual
 * `for` with a `break`, `findIndex`. This spec pins down exactly the decisions the
 * copies could have drifted on silently: which coordinate an axis reads, what happens
 * right on the midpoint of a child, and what a zone with no children answers.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    queryLayoutDropItems,
    resolveLinearDropIndex,
} from '../../src/runtime/modules/layouts-blocks/utils/linearDropPlacement';
// #endregion

/**
 * Builds a child with the given rectangle: happy-dom has no real layout, and the walk
 * reads nothing but `getBoundingClientRect`.
 *
 * @param rect - Bounds of the child in viewport coordinates.
 * @returns An element reporting that rectangle.
 */
function childAt(rect: { left: number; top: number; width: number; height: number }): HTMLElement {
    const element = document.createElement('div');

    element.getBoundingClientRect = () =>
        ({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            right: rect.left + rect.width,
            bottom: rect.top + rect.height,
        }) as DOMRect;

    return element;
}

/** Two columns 100 wide: midpoints at 50 and 250 */
const HORIZONTAL_CHILDREN = [
    childAt({ left: 0, top: 0, width: 100, height: 20 }),
    childAt({ left: 200, top: 0, width: 100, height: 20 }),
];

/** Two rows 100 tall: midpoints at 50 and 250 */
const VERTICAL_CHILDREN = [
    childAt({ left: 0, top: 0, width: 20, height: 100 }),
    childAt({ left: 0, top: 200, width: 20, height: 100 }),
];

/**
 * Cursor position: the walk reads only clientX and clientY out of the event.
 *
 * @param clientX - Horizontal coordinate.
 * @param clientY - Vertical coordinate.
 */
function pointerAt(clientX: number, clientY: number): Pick<DragEvent, 'clientX' | 'clientY'> {
    return { clientX, clientY };
}

describe('insertion index of a flow zone', () => {
    it('reads clientX on the horizontal axis and clientY on the vertical one', () => {
        // The cursor sits before the midpoint on its own axis and far past it on the
        // other one: a swapped axis answers 2 instead of 0
        expect(
            resolveLinearDropIndex(pointerAt(10, 999), 'horizontal', () => HORIZONTAL_CHILDREN)
        ).toBe(0);
        expect(
            resolveLinearDropIndex(pointerAt(999, 10), 'vertical', () => VERTICAL_CHILDREN)
        ).toBe(0);
    });

    it('lands after a child when the cursor is exactly on its midpoint', () => {
        expect(
            resolveLinearDropIndex(pointerAt(50, 0), 'horizontal', () => HORIZONTAL_CHILDREN)
        ).toBe(1);
        expect(
            resolveLinearDropIndex(pointerAt(49, 0), 'horizontal', () => HORIZONTAL_CHILDREN)
        ).toBe(0);
    });

    it('picks the following child for a cursor between two of them', () => {
        expect(
            resolveLinearDropIndex(pointerAt(150, 0), 'horizontal', () => HORIZONTAL_CHILDREN)
        ).toBe(1);
    });

    it('answers the number of children past the midpoint of the last one', () => {
        expect(
            resolveLinearDropIndex(pointerAt(999, 0), 'horizontal', () => HORIZONTAL_CHILDREN)
        ).toBe(2);
    });

    it('accepts into position zero in an empty zone', () => {
        expect(resolveLinearDropIndex(pointerAt(999, 999), 'vertical', () => [])).toBe(0);
    });
});

describe('child selection of a flow zone', () => {
    it('answers an empty list for an unmounted container instead of throwing', () => {
        expect(queryLayoutDropItems(null)).toEqual([]);
    });

    it('takes the direct children of the zone only, leaving out the placeholder and grandchildren', () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div data-layout-drop-item="true" id="own">
                <div data-layout-drop-item="true" id="nested"></div>
            </div>
            <div data-layout-drop-destination="true"></div>
        `;

        expect(queryLayoutDropItems(container).map((node) => node.id)).toEqual(['own']);
    });
});
