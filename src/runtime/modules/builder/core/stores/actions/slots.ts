import type { IComponentSlotDefinition } from '../../../../common/types/brick';
import { applySlotDefinitions, findSlot } from '../../utils/slots';
import type { IComponentsSlotActions, IComponentsStore, THistoryOptions } from '../types';
import { adjustReorderTargetIndex } from './order';

/**
 * Operates the slots of layout components: initializing them, adding and removing
 * children, moving them around.
 */
export const slotActions: IComponentsSlotActions = {
    /**
     * Builds the slot structure of a component from the declaration of its brick file.
     *
     * @param componentId - Id of the parent component.
     * @param slots - Slot declarations taken from the brick.
     */
    initializeComponentSlots(
        this: IComponentsStore,
        componentId: string,
        slots: IComponentSlotDefinition[]
    ) {
        const component = this.getComponentById(componentId);
        if (!component || !slots?.length || component.slots?.length) {
            return;
        }

        applySlotDefinitions(component, slots, (slotName) =>
            this.components
                .filter((child) => child.parent === componentId && child.slotName === slotName)
                .map((child) => child.id)
        );
    },

    /**
     * A thin wrapper over `moveComponentToSlot` for adding an element.
     */
    addComponentToSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ) {
        this.moveComponentToSlot(parentId, slotName, childId, index, options);
    },

    /**
     * Removes a component from a slot, clearing the fields that referenced it.
     *
     * @param parentId - Id of the parent component.
     * @param slotName - Name of the slot.
     * @param childId - Component to remove.
     * @param options - History settings.
     */
    removeComponentFromSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        options?: THistoryOptions
    ) {
        const parent = this.getComponentById(parentId);
        const child = this.getComponentById(childId);

        if (!parent || !child || !parent.slots?.length) {
            return;
        }

        const slot = findSlot(parent, slotName);
        if (!slot) {
            return;
        }

        const index = slot.children.indexOf(childId);
        if (index === -1) {
            return;
        }

        slot.children.splice(index, 1);

        if (child.parent === parentId) {
            child.parent = undefined;
            child.slotName = undefined;
            child.gridColumn = undefined;
            child.gridRow = undefined;
            child.fullWidth = false;

            if (!options?.skipHistory) {
                this.saveToHistory();
            }
        }
    },

    /**
     * Moves a component into a slot, optionally at a given position.
     *
     * @param parentId - Parent component that carries the slots.
     * @param slotName - Target slot.
     * @param childId - Component to move.
     * @param index - Insertion index, or `null` to append.
     * @param options - Flag that skips the history entry.
     */
    moveComponentToSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ) {
        const parent = this.getComponentById(parentId);
        const child = this.getComponentById(childId);

        if (!parent || !child || !parent.slots?.length) {
            console.warn('[Bricks Store] moveComponentToSlot: invalid parent or slots missing');
            return;
        }

        const targetSlot = findSlot(parent, slotName);
        if (!targetSlot) {
            console.warn('[Bricks Store] moveComponentToSlot: slot not found', slotName);
            return;
        }

        const currentIndex =
            child.parent === parentId && child.slotName === slotName
                ? targetSlot.children.indexOf(childId)
                : -1;
        const adjustedIndex =
            typeof index === 'number' ? adjustReorderTargetIndex(currentIndex, index) : undefined;

        this.detachComponentFromParent(childId, { skipHistory: true });

        child.parent = parentId;
        child.slotName = slotName;
        child.gridColumn = undefined;
        child.gridRow = undefined;
        child.fullWidth = targetSlot.allowMultiple === false;

        const children = targetSlot.children;

        if (typeof adjustedIndex === 'number') {
            const insertIndex = Math.max(0, Math.min(adjustedIndex, children.length));
            children.splice(insertIndex, 0, childId);
        } else {
            children.push(childId);
        }

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },
};
