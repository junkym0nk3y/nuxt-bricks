import type { IBricksComponent } from '../../../../common/types/brick';
import {
    cloneComponentProps,
    createComponentSlot,
    isLayoutComponent,
    removeChildFromLayout as removeChildFromLayoutHelper,
} from '../../../../common/utils/bricks/components';
import { normalizeBrickPath } from '../../../../common/utils/bricks/paths';
import { generateComponentId } from '../../utils/ids';
import { useSidebarStore } from '../sidebar';
import { adjustReorderTargetIndex } from './order';
import type {
    IComponentsStore,
    IComponentsCrudActions,
    TComponentInsertPayload,
    THistoryOptions,
    TMoveComponentToLayoutOptions,
} from '../types';

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
function resolveGridProperty(
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
 * The CRUD operations over the canvas components and their hierarchy.
 */
export const crudActions: IComponentsCrudActions = {
    /**
     * Creates a canvas component with a unique id and the right z-index.
     *
     * @param component - Component fields without the system ones.
     * @param options - Flags over the side effects (the history entry, for one).
     * @returns The generated id of the component.
     */
    addComponent(
        this: IComponentsStore,
        component: TComponentInsertPayload,
        options?: THistoryOptions
    ) {
        const id = generateComponentId();
        const maxZIndex = Math.max(0, ...this.components.map((c) => c.zIndex));
        const isLayout = component.brickPath.startsWith('layout/');

        const newComponent: IBricksComponent = {
            ...component,
            id,
            type: isLayout ? 'layout' : 'component',
            zIndex: maxZIndex + 1,
            children: isLayout ? [] : undefined,
            slots: component.slots?.map((slot) => createComponentSlot(slot)),
            brickPath: normalizeBrickPath(component.brickPath),
            props: cloneComponentProps(component.props),
            fullWidth: false,
        };

        this.components.push(newComponent);

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
        return id;
    },

    /**
     * Removes a component by id, unlinking every descendant along the way and updating
     * the selection.
     *
     * @param id - Id of the component to remove.
     */
    removeComponent(this: IComponentsStore, id: string) {
        const target = this.getComponentById(id);
        if (!target) {
            return;
        }

        this.detachComponentFromParent(id, { skipHistory: true });

        const idsToRemove = new Set<string>();
        const queue: IBricksComponent[] = [target];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || idsToRemove.has(current.id)) {
                continue;
            }

            idsToRemove.add(current.id);

            current.children?.forEach((childId) => {
                const child = this.getComponentById(childId);
                if (child) {
                    queue.push(child);
                }
            });

            current.slots?.forEach((slot) => {
                slot.children.forEach((childId) => {
                    const child = this.getComponentById(childId);
                    if (child) {
                        queue.push(child);
                    }
                });
            });
        }

        if (idsToRemove.size === 0) {
            return;
        }

        this.components = this.components.filter((component) => {
            if (!idsToRemove.has(component.id)) {
                return true;
            }

            if (component.parent && !idsToRemove.has(component.parent)) {
                component.parent = undefined;
                component.slotName = undefined;
                component.gridColumn = undefined;
                component.gridRow = undefined;
            }

            return false;
        });

        if (this.selectedComponent && idsToRemove.has(this.selectedComponent.id)) {
            this.selectedComponent = null;
            const sidebarStore = useSidebarStore();
            sidebarStore.hidePropertiesPanel();
        }

        this.saveToHistory();
    },

    /**
     * Unlinks a component from its parent and clears the positional properties.
     *
     * @param childId - Id of the child component.
     * @param options - Option that skips the history entry.
     */
    detachComponentFromParent(this: IComponentsStore, childId: string, options?: THistoryOptions) {
        const child = this.getComponentById(childId);
        if (!child?.parent) {
            return;
        }

        const parent = this.getComponentById(child.parent);

        parent?.children?.splice(parent.children.indexOf(childId), 1);
        parent?.slots?.forEach((slot) => {
            const idx = slot.children.indexOf(childId);
            if (idx !== -1) {
                slot.children.splice(idx, 1);
            }
        });

        child.parent = undefined;
        child.slotName = undefined;
        child.gridColumn = undefined;
        child.gridRow = undefined;
        child.fullWidth = false;

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },

    /**
     * Adds a child component into a layout at a given position.
     *
     * @param layoutId - Id of the layout component.
     * @param childId - Id of the component being added.
     * @param index - Wanted insertion position.
     * @param options - Extra history settings.
     */
    addChildToLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ) {
        const layout = this.getComponentById(layoutId);
        const child = this.getComponentById(childId);
        if (!layout || !child || !isLayoutComponent(layout)) {
            return;
        }

        layout.children = layout.children || [];
        if (layout.children.includes(childId)) {
            return;
        }

        const insertIndex =
            typeof index === 'number'
                ? Math.max(0, Math.min(index, layout.children.length))
                : layout.children.length;

        layout.children.splice(insertIndex, 0, childId);
        child.parent = layoutId;
        child.slotName = undefined;
        if (layout.componentName !== 'grid') {
            child.gridColumn = undefined;
            child.gridRow = undefined;
        }
        child.fullWidth = undefined;

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },

    /**
     * Removes a child component from a layout and clears its positioning metadata.
     *
     * @param layoutId - The parent layout.
     * @param childId - Child component to remove.
     * @param options - History settings.
     */
    removeChildFromLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        options?: THistoryOptions
    ) {
        const layout = this.getComponentById(layoutId);
        const child = this.getComponentById(childId);
        if (!layout?.children || !child) {
            return;
        }

        const childRemoved = removeChildFromLayoutHelper(layout, childId);
        if (!childRemoved) {
            return;
        }

        child.parent = undefined;
        child.slotName = undefined;
        child.gridColumn = undefined;
        child.gridRow = undefined;
        child.fullWidth = false;

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },

    /**
     * Moves a component into a layout, keeping the relative order and the grid
     * placement.
     *
     * @param layoutId - Target layout.
     * @param childId - Component to move.
     * @param options - Position and grid options.
     */
    moveComponentToLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        options?: TMoveComponentToLayoutOptions
    ) {
        const layout = this.getComponentById(layoutId);
        const component = this.getComponentById(childId);

        if (!layout || !isLayoutComponent(layout) || !component) {
            console.warn('[Bricks Store] Unable to move component to layout', {
                layoutId,
                childId,
            });
            return;
        }

        layout.children = layout.children || [];
        const isSameLayout = component.parent === layoutId;

        if (!isSameLayout) {
            this.detachComponentFromParent(childId, { skipHistory: true });
        }

        const currentChildren = layout.children;
        const desiredIndex =
            typeof options?.targetIndex === 'number'
                ? Math.max(0, Math.min(options.targetIndex, currentChildren.length))
                : currentChildren.length;

        if (isSameLayout) {
            const currentIndex = currentChildren.indexOf(childId);
            if (currentIndex === -1) {
                currentChildren.splice(desiredIndex, 0, childId);
            } else if (currentIndex !== desiredIndex) {
                const clampedTarget = Math.min(desiredIndex, currentChildren.length - 1);

                if (options?.swap) {
                    // Swap: the two entries trade places in the array
                    const swappedId = currentChildren[clampedTarget];
                    currentChildren[clampedTarget] = childId;
                    currentChildren[currentIndex] = swappedId;

                    // The grid placement of both components is cleared, so that CSS
                    // Grid lays them out in DOM order
                    const swappedComponent = this.getComponentById(swappedId);
                    if (swappedComponent) {
                        swappedComponent.gridColumn = undefined;
                        swappedComponent.gridRow = undefined;
                    }
                } else {
                    currentChildren.splice(currentIndex, 1);
                    const adjustedIndex =
                        currentIndex < desiredIndex ? desiredIndex - 1 : desiredIndex;
                    currentChildren.splice(adjustedIndex, 0, childId);
                }
            }
        } else {
            const insertIndex = Math.max(0, Math.min(desiredIndex, currentChildren.length));
            currentChildren.splice(insertIndex, 0, childId);
            component.parent = layoutId;
            component.fullWidth = undefined;
        }

        const hasExplicitIndex = typeof options?.targetIndex === 'number';
        const isGrid = layout.componentName === 'grid';

        component.gridColumn = resolveGridProperty(
            options?.gridColumn,
            component.gridColumn,
            hasExplicitIndex,
            isGrid
        );
        component.gridRow = resolveGridProperty(
            options?.gridRow,
            component.gridRow,
            hasExplicitIndex,
            isGrid
        );

        this.saveToHistory();
    },

    /**
     * Moves a component up to the root level of the canvas, optionally at a given
     * position.
     *
     * @param childId - Component to lift to the top level.
     * @param targetIndex - Position among the root elements.
     * @param options - History settings.
     */
    moveComponentToRoot(
        this: IComponentsStore,
        childId: string,
        targetIndex?: number | null,
        options?: THistoryOptions
    ) {
        const componentIndex = this.components.findIndex((component) => component.id === childId);
        if (componentIndex === -1) {
            console.warn('[Bricks Store] moveComponentToRoot: component not found', childId);
            return;
        }

        const component = this.components[componentIndex];
        const rootComponentsBeforeMove = this.getRootComponents();
        const currentRootIndex = rootComponentsBeforeMove.findIndex(
            (rootComponent) => rootComponent.id === childId
        );

        const wasNested = Boolean(component.parent);

        if (component.parent) {
            this.detachComponentFromParent(childId, { skipHistory: true });
        }

        component.parent = undefined;
        component.gridColumn = undefined;
        component.gridRow = undefined;
        // A block arriving in the root out of a layout comes in contained (the default
        // of the root level), while reordering a block that is already at the root must
        // not clear the fullWidth someone set.
        component.fullWidth = wasNested ? false : (component.fullWidth ?? false);

        const [removedComponent] = this.components.splice(componentIndex, 1);
        if (!removedComponent) {
            return;
        }

        const rootComponents = this.components.filter((item) => !item.parent);
        let insertIndex = this.components.length;

        if (typeof targetIndex === 'number') {
            const adjustedTargetIndex = adjustReorderTargetIndex(currentRootIndex, targetIndex);
            const clamped = Math.max(0, Math.min(adjustedTargetIndex, rootComponents.length));
            if (clamped === rootComponents.length) {
                insertIndex = this.components.length;
            } else {
                const siblingId = rootComponents[clamped]?.id;
                const siblingIndex = this.components.findIndex((item) => item.id === siblingId);
                insertIndex = siblingIndex === -1 ? this.components.length : siblingIndex;
            }
        }

        this.components.splice(insertIndex, 0, removedComponent);

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },

    /**
     * Returns every top-level component, that is every one without a parent.
     */
    getRootComponents(this: IComponentsStore): IBricksComponent[] {
        return this.components.filter((component) => !component.parent);
    },
};
