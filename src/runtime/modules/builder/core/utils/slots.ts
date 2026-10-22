import type {
    IComponentSlotDefinition,
    IBricksComponent,
    IBricksComponentSlot,
} from '../../../common/types/brick';

/**
 * Initializes the slots of a layout component from its metadata.
 *
 * @param component - Layout component whose slots are to be filled.
 * @param slots - Slot declarations taken from the brick.
 * @param resolveChildren - Returns the ids of the children of a slot.
 */
export function applySlotDefinitions(
    component: IBricksComponent,
    slots: IComponentSlotDefinition[],
    resolveChildren?: (slotName: string) => string[]
): void {
    if (!slots?.length) {
        return;
    }

    component.slots = slots.map((slot) => ({
        name: slot.name,
        label: slot.label ?? slot.name,
        description: slot.description,
        allowMultiple: slot.allowMultiple !== false,
        children: resolveChildren ? resolveChildren(slot.name) : [],
    }));
}

/**
 * Finds a slot by name inside a layout component.
 *
 * @param component - Component with declared slots.
 * @param slotName - Name of the slot to find.
 * @returns The slot, or undefined when there is none.
 */
export function findSlot(
    component: IBricksComponent | undefined,
    slotName: string
): IBricksComponentSlot | undefined {
    return component?.slots?.find((slot) => slot.name === slotName);
}
