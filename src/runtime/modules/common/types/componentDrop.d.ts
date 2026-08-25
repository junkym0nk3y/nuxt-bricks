/**
 * The neutral contract between a drop zone and the surface that owns the schema.
 *
 * A layout block draws the insertion point but knows nothing about the schema: by the
 * module boundaries `layouts-blocks` does not see `builder`, so the rule of a permitted
 * move cannot be imported there. The host puts the answer in through this contract
 * instead, and the zone asks it before promising a place.
 */

/** Where the dragged component would land, as the drop zone knows it. */
export type TComponentDropTarget =
    | { kind: 'layout'; parentId: string }
    | { kind: 'slot'; parentId: string; slotName: string };

/**
 * The guard the host provides.
 *
 * The zone passes the destination only: what is being dragged is the host's business (a
 * drag session keeps the id of the moved component, and `dataTransfer` refuses to hand
 * the payload out before the drop anyway).
 */
export interface IComponentDropGuard {
    /**
     * Whether the host would carry out a move to this destination.
     *
     * @param target - Destination of the drop.
     * @returns The move would be performed.
     */
    canDrop(target: TComponentDropTarget): boolean;
}
