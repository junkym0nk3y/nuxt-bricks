import type { IBricksComponent, TBricksDeviceKey } from '../../../common/types/brick';

/** Height of a subtree, or the mark that it holds a cycle. */
export type TComponentSubtreeHeight = { hasCycle: true } | { hasCycle: false; height: number };

/**
 * Where a component is being moved to.
 *
 * Three destinations rather than a pair of optional fields: the root level has no
 * parent at all, a layout keeps its children in `children`, and a slot in
 * `slots[].children` — the checks and the refusals of the three differ.
 */
export type TComponentMoveDestination =
    | { kind: 'root' }
    | { kind: 'layout'; parentId: string }
    | { kind: 'slot'; parentId: string; slotName: string };

/**
 * Why a move is refused. Machine-readable: the store puts it into the log, the
 * interface turns it into a locale key.
 */
export type TComponentMoveRefusalReason =
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

/** Verdict on a move. */
export type TComponentMoveDecision =
    | { allowed: true }
    | { allowed: false; reason: TComponentMoveRefusalReason };

/**
 * Input of the move check.
 *
 * `viewport` is optional, and that is the split of responsibilities: the
 * integrity of the graph (a cycle, the depth, the container) does not depend on
 * the device, while the capacity of a Grid is counted in cells of a CONCRETE
 * viewport (`rows`/`columns` have responsive overrides). Where there is no
 * viewport to speak of — the store, which guards integrity for every surface at
 * once — the capacity is not judged.
 */
export interface IComponentMoveQuery {
    components: readonly IBricksComponent[];
    sourceId: string;
    destination: TComponentMoveDestination;
    viewport?: TBricksDeviceKey;
}

/**
 * Input of the check for a NEW component: there is no source in the schema yet, so the
 * query carries the destination alone.
 */
export interface IComponentInsertionQuery {
    components: readonly IBricksComponent[];
    destination: TComponentMoveDestination;
    viewport?: TBricksDeviceKey;
}

/**
 * Result of a move performed by the store: a refusal is an expected outcome and
 * not an exception, so every caller has to look at it — the ones that write a
 * history entry of their own above all.
 */
export type TComponentMoveResult =
    | { moved: true }
    | { moved: false; reason: TComponentMoveRefusalReason };

/** Input of a rearrangement inside the children of one container. */
export interface IReorderWithinLayoutParams {
    children: string[];
    childId: string;
    desiredIndex: number;
    /** The Grid model: the two entries trade places and both lose their cells. */
    swap: boolean;
    getComponentById: (id: string) => IBricksComponent | undefined;
}
