import type { IComponentsOrderActions, IComponentsStore } from '../types';
import { resolveComponentSiblingContext } from '../../utils/componentSiblings';

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
 * Swaps two neighboring entries of a children list in place.
 *
 * @param children - Live children array the component lies in: the one of a layout or
 * the one of a slot.
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
        const context = resolveComponentSiblingContext(this.components, id);
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
        const context = resolveComponentSiblingContext(this.components, id);
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
