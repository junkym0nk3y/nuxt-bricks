/**
 * The mechanics of the children list of a layout block: the placement of a child
 * in a grid and its rearrangement inside the list.
 *
 * Split off from the store actions rather than kept next to them, because these
 * are pure functions over a list and a component — they are read and tested
 * without Pinia, and it is the store that got past its size ceiling with them
 * inside.
 */

// #region Imports
// Types
import type { IReorderWithinLayoutParams } from '../types/componentMove';

// Utils
import { getBlockDefinition } from '../../../layouts-blocks/registry';
// #endregion

/**
 * Works out the value of a grid property (gridColumn / gridRow) when a component is
 * moved.
 *
 * In order of precedence:
 * 1. A value passed explicitly in the options
 * 2. A targetIndex was given (positioning follows the DOM order) — clear it
 * 3. A grid layout — keep the current value of the component
 * 4. Anything else — clear it
 */
export function resolveGridProperty(
    explicitValue: string | undefined,
    currentValue: string | undefined,
    hasExplicitIndex: boolean,
    isGridLayout: boolean
): string | undefined {
    if (explicitValue !== undefined) {
        return explicitValue || undefined;
    }

    if (hasExplicitIndex) {
        return undefined;
    }

    return isGridLayout ? currentValue : undefined;
}

/**
 * Rearranges a child WITHIN the list of children of one and the same container.
 *
 * Two models of the rearrangement. The plain one moves the entry, closing the gap
 * behind it — that is what a list needs. The swap trades the two entries in place
 * and clears the grid placement of BOTH participants: it is a drop into a cell of
 * a Grid, where the neighbor has to give up its own coordinates, otherwise CSS
 * Grid would keep it where the coordinates say instead of where the DOM order does.
 *
 * @param params - The list, the child, the wanted index and the model of the move.
 */
export function reorderWithinLayout({
    children,
    childId,
    desiredIndex,
    swap,
    getComponentById,
}: IReorderWithinLayoutParams): void {
    const currentIndex = children.indexOf(childId);

    if (currentIndex === -1) {
        children.splice(desiredIndex, 0, childId);

        return;
    }

    if (currentIndex === desiredIndex) {
        return;
    }

    if (!swap) {
        children.splice(currentIndex, 1);
        children.splice(currentIndex < desiredIndex ? desiredIndex - 1 : desiredIndex, 0, childId);

        return;
    }

    const clampedTarget = Math.min(desiredIndex, children.length - 1);
    const swappedId = children[clampedTarget];

    children[clampedTarget] = childId;
    children[currentIndex] = swappedId;

    const swappedComponent = getComponentById(swappedId);

    if (swappedComponent) {
        swappedComponent.gridColumn = undefined;
        swappedComponent.gridRow = undefined;
    }
}

/** Checks whether a schema component names the Grid layout block */
export function isGridLayout(componentName: string): boolean {
    return getBlockDefinition(componentName)?.name === 'Grid';
}
