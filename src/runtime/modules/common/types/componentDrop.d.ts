/**
 * The neutral contract between a drop zone and the surface that owns the schema.
 *
 * A layout block draws the insertion point but knows nothing about the schema: by the
 * module boundaries `layouts-blocks` does not see `builder`, so the rule of a permitted
 * move cannot be imported there. The host puts the answer in through this contract
 * instead, and the zone asks it before promising a place.
 */

import type { TComponentPlacementDecision } from './componentPlacement';

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
     * The verdict of the host on a move to this destination.
     *
     * A verdict and not a boolean, and named so that it cannot be read as one: a refusal
     * carries the reason, and the zone shows a state of its own for it. An object answer
     * behind a boolean-sounding name is the trap here — `if (!guard.canDrop(target))`
     * would never refuse anything.
     *
     * @param target - Destination of the drop.
     * @returns Permission, or a refusal with a machine-readable reason.
     */
    evaluateDrop(target: TComponentDropTarget): TComponentPlacementDecision;
}
