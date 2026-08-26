/**
 * The insertion point of a linear (one-dimensional) drop zone: which index the
 * cursor is pointing between.
 *
 * One implementation for every flow zone of the canvas. The same walk used to live
 * in five copies — the Flex and Section blocks, the slider, the slots of a brick
 * component and the root zone of the canvas — and each of them phrased it slightly
 * differently (`some` with a side assignment, a manual `for` with a `break`,
 * `findIndex`), which is exactly how the copies would have drifted apart.
 */

// #region Imports
// Types
import type { TLayoutDropAxis } from '../types/dropZone';
// #endregion

// #region Data
/** Direct children a layout zone reserves an insertion point between */
const LAYOUT_DROP_ITEM_SELECTOR = ':scope > [data-layout-drop-item="true"]';
// #endregion

// #region Methods
/**
 * Collects the direct children of a layout drop zone in DOM order.
 *
 * The selector is a protocol between the canvas item, which carries the attribute,
 * and the zones that read it — kept in one place so that the set the index is
 * computed over and the set the placeholder is inserted into cannot drift apart.
 * The flow placeholder itself carries no such attribute and stays out on its own.
 *
 * @param container - Root element of the zone, or null while it is not mounted.
 * @returns Children of the zone; an empty list when there is no container.
 */
export function queryLayoutDropItems(container: HTMLElement | null): HTMLElement[] {
    if (!container) {
        return [];
    }

    return Array.from(container.querySelectorAll<HTMLElement>(LAYOUT_DROP_ITEM_SELECTOR));
}

/**
 * Finds the index of the insertion point: the first child whose midpoint the cursor
 * has not passed yet, or the end of the list when it has passed all of them.
 *
 * The children are asked for once and treated as a snapshot of the DOM order. The
 * boundary of the function is drawn there on purpose: the caller owns the selector
 * (a slide of Swiper without the loop duplicates, a slot child, a layout item), the
 * axis and the case of a container that is not mounted, while the walk itself knows
 * nothing about Vue, Swiper, the grid or the builder.
 *
 * Strictly pure it is not — `getBoundingClientRect` reads the layout of the browser.
 * What it does hold to is that it measures and chooses, and never touches the DOM,
 * a ref or any state.
 *
 * @param event - Drag event carrying the cursor position.
 * @param axis - Axis the children are laid out along.
 * @param getChildren - Children of the zone, in DOM order.
 * @returns Index of the insertion point, up to the number of children.
 */
export function resolveLinearDropIndex(
    event: Pick<DragEvent, 'clientX' | 'clientY'>,
    axis: TLayoutDropAxis,
    getChildren: () => readonly HTMLElement[]
): number {
    const children = getChildren();
    const isHorizontal = axis === 'horizontal';
    const pointerPosition = isHorizontal ? event.clientX : event.clientY;

    const hoveredIndex = children.findIndex((child) => {
        const childRect = child.getBoundingClientRect();
        const midpoint = isHorizontal
            ? childRect.left + childRect.width / 2
            : childRect.top + childRect.height / 2;

        return pointerPosition < midpoint;
    });

    return hoveredIndex === -1 ? children.length : hoveredIndex;
}
// #endregion
