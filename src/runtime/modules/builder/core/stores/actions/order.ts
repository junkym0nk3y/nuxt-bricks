import type { IComponentsOrderActions, IComponentsStore } from '../types';

/**
 * Корректирует индекс назначения после извлечения исходного sibling-а.
 *
 * @param currentIndex - Индекс элемента до detach.
 * @param targetIndex - Индекс destination placeholder-а до detach.
 * @returns Индекс вставки в массив после detach.
 */
export function adjustReorderTargetIndex(currentIndex: number, targetIndex: number): number {
    return currentIndex >= 0 && currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
}

/**
 * Находит индекс компонента среди siblings (root или children layout-а).
 *
 * @param store - Стор компонентов.
 * @param id - ID компонента.
 * @returns Объект с массивом siblings и индексом, или null.
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
 * Набор действий для перемещения компонентов вверх/вниз.
 */
export const orderActions: IComponentsOrderActions = {
    /**
     * Перемещает компонент на одну позицию вверх среди siblings.
     *
     * @param id - Идентификатор компонента.
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
     * Перемещает компонент на одну позицию вниз среди siblings.
     *
     * @param id - Идентификатор компонента.
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
