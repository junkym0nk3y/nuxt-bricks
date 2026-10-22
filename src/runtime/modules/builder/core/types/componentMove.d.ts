import type { IBricksComponent, TBricksDeviceKey } from '../../../common/types/brick';
import type { TComponentPlacementRefusalReason } from '../../../common/types/componentPlacement';

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
    | { moved: false; reason: TComponentPlacementRefusalReason };

/** Input of a rearrangement inside the children of one container. */
export interface IReorderWithinLayoutParams {
    children: string[];
    childId: string;
    desiredIndex: number;
    /** The Grid model: the two entries trade places and both lose their cells. */
    swap: boolean;
    getComponentById: (id: string) => IBricksComponent | undefined;
}

/**
 * Position of a component among its siblings.
 *
 * A union of three branches rather than one record with optional fields, because the
 * three lists a component can lie in are rewritten differently: the root order lives in
 * the flat `components` list and only the store knows how to rewrite it, a layout keeps
 * its children in `children`, and a slot in `slots[].children`. Tying `children: null`
 * to the root branch is what stops a caller from taking the throwaway copy of the root
 * ids for a live array it may mutate.
 *
 * `destination` repeats the shape of a move destination on purpose: whoever resolved the
 * neighbors of a row already knows where a sibling drop lands, and deriving it a second
 * time from `parent` alone is exactly how the slot branch used to be lost.
 */
export type TComponentSiblingContext =
    | {
          destination: { kind: 'root' };
          /** Index of the component among its siblings. */
          index: number;
          /** How many siblings there are, the ceiling of a move down. */
          count: number;
          /** The root order is rewritten by the store, not through an array. */
          children: null;
      }
    | {
          destination: { kind: 'layout'; parentId: string };
          index: number;
          count: number;
          /** Live `children` array of the parent. */
          children: string[];
      }
    | {
          destination: { kind: 'slot'; parentId: string; slotName: string };
          index: number;
          count: number;
          /** Live `children` array of the slot. */
          children: string[];
      };
