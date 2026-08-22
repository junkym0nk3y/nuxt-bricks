import type { IComponentsOrderActions, IComponentsStore } from '../types';

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
 * Finds the index of a component among its siblings (the root list, or the children
 * of a layout).
 *
 * @param store - Components store.
 * @param id - Id of the component.
 * @returns The siblings and the index, or null when there are none.
 */
function findSiblingContext(
    store: IComponentsStore,
    id: string
): { siblings: string[]; index: number; parentId: string | null } | null {
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

        return { siblings: parent.children, index, parentId: component.parent };
    }

    const rootComponents = store.getRootComponents();
    const index = rootComponents.findIndex((item) => item.id === id);
    if (index === -1) {
        return null;
    }

    return {
        siblings: rootComponents.map((item) => item.id),
        index,
        parentId: null,
    };
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

        if (context.parentId) {
            const parent = this.getComponentById(context.parentId);
            if (!parent?.children) {
                return;
            }
            const arr = parent.children;
            const idx = arr.indexOf(id);
            if (idx <= 0) {
                return;
            }
            [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
            this.saveToHistory();
        } else {
            this.moveComponentToRoot(id, context.index - 1);
        }
    },

    /**
     * Moves a component one position down among its siblings.
     *
     * @param id - Id of the component.
     */
    moveComponentDown(this: IComponentsStore, id: string) {
        const context = findSiblingContext(this, id);
        if (!context || context.index >= context.siblings.length - 1) {
            return;
        }

        if (context.parentId) {
            const parent = this.getComponentById(context.parentId);
            if (!parent?.children) {
                return;
            }
            const arr = parent.children;
            const idx = arr.indexOf(id);
            if (idx === -1 || idx >= arr.length - 1) {
                return;
            }
            [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
            this.saveToHistory();
        } else {
            this.moveComponentToRoot(id, context.index + 1);
        }
    },
};
