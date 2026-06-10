import type { LandingComponent } from '../../../common/types/landing';
import { cloneLandingComponent } from '../../../common/utils/landing/components';
import { generateComponentId } from '../../../common/utils/landing/paths';
import type {
    ILandingComponentsClipboardActions,
    ILandingComponentsStore,
    IComponentClipboardSnapshot,
} from '../types';

/**
 * Вычисляет всех непосредственных детей компонента, независимо от того,
 * где именно хранится ссылка (children, slots или через поле parent у потомка).
 *
 * @param store - Стор компонентов.
 * @param component - Компонент, для которого определяется поддерево.
 * @returns Уникальный список идентификаторов дочерних элементов.
 */
function resolveDirectChildren(
    store: ILandingComponentsStore,
    component: LandingComponent
): string[] {
    const directIds = new Set<string>();

    component.children?.forEach((childId) => {
        if (childId) {
            directIds.add(childId);
        }
    });

    component.slots?.forEach((slot) => {
        slot.children.forEach((childId) => {
            if (childId) {
                directIds.add(childId);
            }
        });
    });

    store.components.forEach((candidate) => {
        if (candidate.parent === component.id) {
            directIds.add(candidate.id);
        }
    });

    return [...directIds];
}

/**
 * Собирает полное дерево компонента и всех его потомков.
 *
 * @param store - Стор компонентов.
 * @param rootId - Идентификатор копируемого корневого элемента.
 * @returns Массив клонов компонентов (с оригинальными ID).
 */
function collectComponentTree(store: ILandingComponentsStore, rootId: string): LandingComponent[] {
    const queue: string[] = [rootId];
    const visited = new Set<string>();
    const result: LandingComponent[] = [];

    while (queue.length > 0) {
        const id = queue.shift();
        if (!id || visited.has(id)) {
            continue;
        }

        visited.add(id);
        const component = store.getComponentById(id);
        if (!component) {
            continue;
        }

        result.push(cloneLandingComponent(component));

        const childIds = resolveDirectChildren(store, component);
        childIds.forEach((childId) => {
            if (!visited.has(childId)) {
                queue.push(childId);
            }
        });
    }

    return result;
}

/**
 * Подбирает позицию, в которой вставить клон относительно исходного компонента.
 *
 * @param store - Стор компонентов.
 * @param component - Оригинальный компонент.
 * @returns Индекс вставки или null, если позиция не определена.
 */
function resolveInsertIndex(
    store: ILandingComponentsStore,
    component: LandingComponent
): number | null {
    if (component.parent) {
        const parent = store.getComponentById(component.parent);
        if (!parent) {
            return null;
        }

        if (component.slotName && parent.slots?.length) {
            const slot = parent.slots.find((item) => item.name === component.slotName);
            if (!slot) {
                return null;
            }
            const index = slot.children.indexOf(component.id);
            return index === -1 ? slot.children.length : index + 1;
        }

        if (parent.children?.length) {
            const index = parent.children.indexOf(component.id);
            return index === -1 ? parent.children.length : index + 1;
        }

        return null;
    }

    const rootComponents = store.getRootComponents();
    const index = rootComponents.findIndex((item) => item.id === component.id);
    return index === -1 ? rootComponents.length : index + 1;
}

/**
 * Формирует снапшот дерева для клипборда.
 *
 * @param store - Стор компонентов.
 * @param rootId - ID компонента, который копируем.
 * @returns Структура клипборда либо null при ошибке.
 */
function createClipboardSnapshot(
    store: ILandingComponentsStore,
    rootId: string
): IComponentClipboardSnapshot | null {
    const root = store.getComponentById(rootId);
    if (!root) {
        console.warn('[Landing Store] copyComponentToClipboard: component not found', rootId);
        return null;
    }

    const tree = collectComponentTree(store, rootId);
    if (!tree.length) {
        return null;
    }

    // Сохраняем свойства из selectedComponent, если копируем выбранный компонент
    const selectedData = store.selectedComponent;
    const properties = selectedData?.id === rootId ? selectedData.properties : undefined;
    const description = selectedData?.id === rootId ? selectedData.description : undefined;

    return {
        rootId: root.id,
        parentId: root.parent ?? null,
        slotName: root.slotName,
        insertIndex: resolveInsertIndex(store, root),
        fullWidth: root.fullWidth,
        tree,
        properties,
        description,
    };
}

/**
 * Разворачивает снапшот клипборда и вставляет его обратно в стор.
 *
 * @param store - Стор компонентов.
 * @param snapshot - Сохранённое дерево.
 * @returns ID новосозданного корневого компонента.
 */
function pasteClipboardSnapshot(
    store: ILandingComponentsStore,
    snapshot: IComponentClipboardSnapshot
): string | null {
    if (!snapshot.tree.length) {
        return null;
    }

    const idMap = new Map<string, string>();
    snapshot.tree.forEach((component) => {
        idMap.set(component.id, generateComponentId());
    });

    const clones: Array<{ originalId: string; component: LandingComponent }> = snapshot.tree.map(
        (component) => {
            const clone = cloneLandingComponent(component);
            const newId = idMap.get(component.id)!;
            clone.id = newId;

            if (component.parent) {
                clone.parent = idMap.get(component.parent) ?? component.parent;
            } else {
                clone.parent = undefined;
            }

            if (clone.children?.length) {
                clone.children = clone.children
                    .map((childId) => idMap.get(childId))
                    .filter((childId): childId is string => Boolean(childId));
            }

            clone.slots?.forEach((slot) => {
                slot.children = slot.children
                    .map((childId) => idMap.get(childId))
                    .filter((childId): childId is string => Boolean(childId));
            });

            return { originalId: component.id, component: clone };
        }
    );

    const maxZIndex = Math.max(0, ...store.components.map((item) => item.zIndex));
    clones
        .sort((a, b) => a.component.zIndex - b.component.zIndex)
        .forEach((entry, index) => {
            entry.component.zIndex = maxZIndex + index + 1;
        });

    store.components.push(...clones.map((entry) => entry.component));

    const rootClone = clones.find((entry) => entry.originalId === snapshot.rootId)?.component;
    if (!rootClone) {
        console.warn('[Landing Store] pasteFromClipboard: root clone not found');
        return null;
    }

    if (snapshot.parentId) {
        const parent = store.getComponentById(snapshot.parentId);

        if (snapshot.slotName && parent?.slots?.length) {
            store.addComponentToSlot(
                snapshot.parentId,
                snapshot.slotName,
                rootClone.id,
                snapshot.insertIndex,
                {
                    skipHistory: true,
                }
            );
        } else if (parent?.type === 'layout') {
            store.addChildToLayout(snapshot.parentId, rootClone.id, snapshot.insertIndex, {
                skipHistory: true,
            });
        } else {
            store.moveComponentToRoot(rootClone.id, snapshot.insertIndex, { skipHistory: true });
        }
    } else {
        store.moveComponentToRoot(rootClone.id, snapshot.insertIndex, { skipHistory: true });
        rootClone.fullWidth =
            typeof snapshot.fullWidth === 'boolean'
                ? snapshot.fullWidth
                : (rootClone.fullWidth ?? false);
    }

    store.saveToHistory();
    store.selectComponent(rootClone.id, snapshot.properties ?? [], snapshot.description);
    return rootClone.id;
}

/**
 * Набор действий для работы с клипбордом компонентов (копирование/вставка/дублирование).
 */
export const clipboardActions: ILandingComponentsClipboardActions = {
    /**
     * Копирует компонент по ID в буфер обмена стор.
     *
     * @param id - Идентификатор корневого компонента.
     */
    copyComponentToClipboard(this: ILandingComponentsStore, id: string) {
        const snapshot = createClipboardSnapshot(this, id);
        if (!snapshot) {
            return;
        }
        this.clipboard = snapshot;
    },

    /**
     * Копирует текущий выбранный компонент, если он существует.
     */
    copySelectedComponent(this: ILandingComponentsStore) {
        if (!this.selectedComponent) {
            return;
        }
        this.copyComponentToClipboard(this.selectedComponent.id);
    },

    /**
     * Вставляет дерево из клипборда, если оно существует.
     */
    pasteFromClipboard(this: ILandingComponentsStore) {
        if (!this.clipboard) {
            console.warn('[Landing Store] pasteFromClipboard: clipboard is empty');
            return;
        }

        pasteClipboardSnapshot(this, this.clipboard);
    },

    /**
     * Дублирует компонент, вставляя копию сразу после оригинала.
     * Не затрагивает буфер обмена (this.clipboard).
     *
     * @param id - Идентификатор компонента для дублирования.
     */
    duplicateComponent(this: ILandingComponentsStore, id: string) {
        const snapshot = createClipboardSnapshot(this, id);
        if (!snapshot) {
            return;
        }

        pasteClipboardSnapshot(this, snapshot);
    },
};
