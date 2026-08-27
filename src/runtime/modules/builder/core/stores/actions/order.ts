import type { IComponentsOrderActions, IComponentsStore } from '../types';
import type { IComponentSiblingContext } from '../../types/componentMove';

/**
 * Corrects the target index after the moved sibling has been pulled out.
 *
 * @param currentIndex - Index of the element before the detach.
 * @param targetIndex - Index of the destination placeholder before the detach.
 * @returns Insertion index into the array after the detach.
 */
export function adjustReorderTargetIndex(currentIndex: number, targetIndex: number): number {
    return currentIndex >= 0 && currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
}

/**
 * Finds the position of a component among its siblings (the root list, or the children
 * of a layout).
 *
 * @param store - Components store.
 * @param id - Id of the component.
 * @returns The position, or null when the component has no place in the graph.
 */
function findSiblingContext(store: IComponentsStore, id: string): IComponentSiblingContext | null {
    const component = store.getComponentById(id);
    if (!component) {
        return null;
    }

    if (component.parent) {
        const parent = store.getComponentById(component.parent);
        if (!parent?.children) {
            return null;
        }

        const index = parent.children.indexOf(id);
        if (index === -1) {
            return null;
        }

        return { index, count: parent.children.length, children: parent.children };
    }

    const rootComponents = store.getRootComponents();
    const index = rootComponents.findIndex((item) => item.id === id);
    if (index === -1) {
        return null;
    }

    return { index, count: rootComponents.length, children: null };
}

/**
 * Swaps two neighboring entries of a children list in place.
 *
 * @param children - Live children array of the parent.
 * @param index - Index of the first of the pair.
 */
function swapWithNext(children: string[], index: number): void {
    [children[index], children[index + 1]] = [children[index + 1], children[index]];
}

/**
 * Actions that move a component up and down.
 */
export const orderActions: IComponentsOrderActions = {
    /**
     * Moves a component one position up among its siblings.
     *
     * @param id - Id of the component.
     */
    moveComponentUp(this: IComponentsStore, id: string) {
        const context = findSiblingContext(this, id);
        if (!context || context.index <= 0) {
            return;
        }

        if (context.children) {
            swapWithNext(context.children, context.index - 1);
            this.saveToHistory();
            return;
        }

        this.moveComponentToRoot(id, context.index - 1);
    },

    /**
     * Moves a component one position down among its siblings.
     *
     * @param id - Id of the component.
     */
    moveComponentDown(this: IComponentsStore, id: string) {
        const context = findSiblingContext(this, id);
        if (!context || context.index >= context.count - 1) {
            return;
        }

        if (context.children) {
            swapWithNext(context.children, context.index);
            this.saveToHistory();
            return;
        }

        // `moveComponentToRoot` takes the gap of the destination in the list BEFORE the
        // component is pulled out of it, and corrects the index itself
        // (`adjustReorderTargetIndex`). So the gap behind the next sibling is `index + 2`:
        // `index + 1` corrects back into the current position and the move down does
        // nothing at all.
        this.moveComponentToRoot(id, context.index + 2);
    },
};
