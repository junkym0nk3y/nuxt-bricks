/**
 * The verdict on placing a component somewhere in the schema — the vocabulary shared by
 * every surface that asks the question and every surface that answers it.
 *
 * The reason lives in `common` and not next to the rule that produces it because a drop
 * zone has to act on it: a Grid paints its refusal red only when it is out of cells, and
 * `layouts-blocks` may not import `builder`. Folding the reasons into a coarser pair on
 * the way down would take the answer away from the message the user is shown — a
 * descendant, a depth limit and a full Grid each need their own wording.
 *
 * The lower layer owning the protocol is not a breach of the layering: it already owns
 * the destination of a drop and the depth limit of the schema contract. What stays in the
 * builder is how the verdict is computed and how it is shown.
 */

/**
 * Why a placement is refused. Machine-readable: the store puts it into the log, the
 * interface turns it into a locale key, a drop zone turns it into its own state.
 */
export type TComponentPlacementRefusalReason =
    | 'source-not-found'
    | 'target-not-found'
    | 'self'
    | 'descendant'
    | 'invalid-graph'
    | 'target-not-container'
    | 'slot-not-found'
    | 'slot-capacity'
    | 'depth-limit'
    | 'grid-capacity';

/** Verdict on a placement. */
export type TComponentPlacementDecision =
    | { allowed: true }
    | { allowed: false; reason: TComponentPlacementRefusalReason };
