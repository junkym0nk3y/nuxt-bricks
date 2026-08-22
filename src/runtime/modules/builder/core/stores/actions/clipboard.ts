import type { IBricksComponent } from '../../../../common/types/brick';
import { cloneBricksComponent } from '../../../../common/utils/bricks/components';
import { generateComponentId } from '../../utils/ids';
import { useComponentEditorMetadata } from '../../composables/useComponentEditorMetadata';
import type {
    IComponentsClipboardActions,
    IComponentsStore,
    IComponentClipboardSnapshot,
} from '../types';

/**
 * Works out every direct child of a component, wherever the reference is kept —
 * `children`, a slot, or the `parent` field of the child itself.
 *
 * @param store - Components store.
 * @param component - Component whose subtree is being resolved.
 * @returns Unique ids of the children.
 */
function resolveDirectChildren(store: IComponentsStore, component: IBricksComponent): string[] {
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
 * Collects the whole tree of a component and all of its descendants.
 *
 * @param store - Components store.
 * @param rootId - Id of the root element being copied.
 * @returns Clones of the components, still carrying the original ids.
 */
function collectComponentTree(store: IComponentsStore, rootId: string): IBricksComponent[] {
    const queue: string[] = [rootId];
    const visited = new Set<string>();
    const result: IBricksComponent[] = [];

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

        result.push(cloneBricksComponent(component));

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
 * Picks the position the clone is inserted at, relative to the original component.
 *
 * @param store - Components store.
 * @param component - The original component.
 * @returns Insertion index, or null when the position cannot be worked out.
 */
function resolveInsertIndex(store: IComponentsStore, component: IBricksComponent): number | null {
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
 * Builds the clipboard snapshot of a tree.
 *
 * @param store - Components store.
 * @param rootId - Id of the component being copied.
 * @returns The clipboard structure, or null on failure.
 */
function createClipboardSnapshot(
    store: IComponentsStore,
    rootId: string
): IComponentClipboardSnapshot | null {
    const root = store.getComponentById(rootId);
    if (!root) {
        console.warn('[Bricks Store] copyComponentToClipboard: component not found', rootId);
        return null;
    }

    const tree = collectComponentTree(store, rootId);
    if (!tree.length) {
        return null;
    }

    return {
        rootId: root.id,
        parentId: root.parent ?? null,
        slotName: root.slotName,
        insertIndex: resolveInsertIndex(store, root),
        fullWidth: root.fullWidth,
        tree,
    };
}

/**
 * Unfolds a clipboard snapshot and puts it back into the store.
 *
 * @param store - Components store.
 * @param snapshot - The stored tree.
 * @returns Id of the newly created root component.
 */
function pasteClipboardSnapshot(
    store: IComponentsStore,
    snapshot: IComponentClipboardSnapshot
): string | null {
    if (!snapshot.tree.length) {
        return null;
    }

    const idMap = new Map<string, string>();
    snapshot.tree.forEach((component) => {
        idMap.set(component.id, generateComponentId());
    });

    const clones: Array<{ originalId: string; component: IBricksComponent }> = snapshot.tree.map(
        (component) => {
            const clone = cloneBricksComponent(component);
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

    const rootClone = clones.find((entry) => entry.originalId === snapshot.rootId)?.component;
    if (!rootClone) {
        console.warn('[Bricks Store] pasteFromClipboard: root clone not found');
        return null;
    }

    // The editor properties come from the current metadata rather than from the
    // clipboard snapshot: a snapshot would outlive both a manifest load and an edit of
    // the brick file, so after a paste the panel would show a stale description of the
    // fields. They are resolved before anything is written to the store: the resolver
    // needs nothing but the fields of the clone and the metadata index, so if it throws,
    // the schema and the history are left untouched
    const { resolveComponentEditorMetadata } = useComponentEditorMetadata();
    const { properties, description } = resolveComponentEditorMetadata(rootClone);

    store.components.push(...clones.map((entry) => entry.component));

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
    store.selectComponent(rootClone.id, properties, description);
    return rootClone.id;
}

/**
 * Actions around the component clipboard: copy, paste and duplicate.
 */
export const clipboardActions: IComponentsClipboardActions = {
    /**
     * Copies a component into the clipboard of the store, by id.
     *
     * @param id - Id of the root component.
     */
    copyComponentToClipboard(this: IComponentsStore, id: string) {
        const snapshot = createClipboardSnapshot(this, id);
        if (!snapshot) {
            return;
        }
        this.clipboard = snapshot;
    },

    /**
     * Copies the currently selected component, when there is one.
     */
    copySelectedComponent(this: IComponentsStore) {
        if (!this.selectedComponent) {
            return;
        }
        this.copyComponentToClipboard(this.selectedComponent.id);
    },

    /**
     * Pastes the tree held in the clipboard, when there is one.
     */
    pasteFromClipboard(this: IComponentsStore) {
        if (!this.clipboard) {
            console.warn('[Bricks Store] pasteFromClipboard: clipboard is empty');
            return;
        }

        pasteClipboardSnapshot(this, this.clipboard);
    },

    /**
     * Duplicates a component, placing the copy right after the original.
     * The clipboard (this.clipboard) is left alone.
     *
     * @param id - Id of the component to duplicate.
     */
    duplicateComponent(this: IComponentsStore, id: string) {
        const snapshot = createClipboardSnapshot(this, id);
        if (!snapshot) {
            return;
        }

        pasteClipboardSnapshot(this, snapshot);
    },
};
