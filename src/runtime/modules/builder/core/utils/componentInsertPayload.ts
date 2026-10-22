// #region Imports
// Types
import type { IComponentLibraryItem, IComponentSlotDefinition } from '../../../common/types/brick';
import type { TComponentInsertPayload } from '../stores/types';
// #endregion

// #region Methods
/**
 * Narrows slots down to their declaration: the four fields a definition carries.
 *
 * Used from both directions of the drag — a library card becoming a store payload
 * and a component on the canvas becoming a card of its own — because the four
 * fields are the whole declaration in either case, and a slot field added to the
 * definition has to reach both.
 *
 * The children of a slot are deliberately left out: they belong to the schema, not
 * to the declaration, and both sides fill them in themselves.
 *
 * @param slots - Slots of a card or of a component on the canvas.
 * @returns The declarations, or undefined when there are no slots.
 */
export function toSlotDeclarations(
    slots: IComponentSlotDefinition[] | undefined
): IComponentSlotDefinition[] | undefined {
    if (!Array.isArray(slots)) {
        return undefined;
    }

    return slots.map((slot) => ({
        name: slot.name,
        label: slot.label,
        description: slot.description,
        allowMultiple: slot.allowMultiple,
    }));
}

/**
 * Builds the store payload of a new component out of a dragged library card.
 *
 * One factory for all three insertion places (the root of the canvas, a layout, a
 * slot): they used to assemble the same object apart from each other, so a new field
 * of the block definition reached one place and not the others — that is exactly how
 * the canvas root came to carry a field into the schema that a drop into a layout
 * dropped on the floor.
 *
 * `defaultProps` are deep-copied: the card belongs to the library list, which lives
 * as long as the session, and a shared object would let an edit of one block reach
 * every next block created from the same card.
 *
 * There is no `width`/`height` here, and that is deliberate: a schema component has
 * no such fields. Two of the three places used to send a pair of zeros, which
 * `addComponent` spread onto the component as it was and wrote into the saved
 * schema, while the third never sent them — nothing has ever read them back.
 *
 * @param card - The library card being dragged.
 * @param placement - Grid cell of the drop, when there is one.
 * @returns The payload of `addComponent`.
 */
export function buildComponentInsertPayload(
    card: IComponentLibraryItem,
    placement?: { gridColumn?: string; gridRow?: string }
): TComponentInsertPayload {
    return {
        componentName: card.name,
        brickPath: card.brickPath,
        gridColumn: placement?.gridColumn || undefined,
        gridRow: placement?.gridRow || undefined,
        props: JSON.parse(JSON.stringify(card.defaultProps || {})),
        slots: toSlotDeclarations(card.slots),
    };
}
// #endregion
