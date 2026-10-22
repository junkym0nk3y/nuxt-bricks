/**
 * Whether a component may be moved to a given place — the single rule for every
 * surface: the schema tree of the sidebar, the canvas and the slots.
 *
 * One rule and not a check per surface, because a check per surface is how the
 * surfaces diverge: the tree drew a drop indicator over a target the store would
 * refuse, the canvas only ever guarded a drop onto the block itself, and nothing
 * at all guarded a move of an ancestor into its own descendant. The one place
 * that must not be bypassed is the store, so the rule is applied there as well:
 * a surface added later gets the invariant whether it asks for it or not.
 *
 * A cycle and a chain over the depth limit are not cosmetic. The schema contract
 * (`validateSchemaComponentGraph`) refuses such a graph — but on SAVE, that is,
 * after the corrupted state has already lived in the draft and in the preview.
 *
 * Integrity is judged without any regard to the device; the capacity of a Grid,
 * on the contrary, is counted in the cells of a concrete viewport, so it is
 * judged only when the caller names one (see `IComponentMoveQuery`).
 */

// #region Imports
// Types
import type { IBricksComponent } from '../../../common/types/brick';
import type { TComponentPlacementDecision } from '../../../common/types/componentPlacement';
import type {
    IComponentInsertionQuery,
    IComponentMoveQuery,
    TComponentMoveDestination,
} from '../types/componentMove';

// Utils
import { MAX_COMPONENT_TREE_DEPTH } from '../../../common/utils/bricks/schemaContract';
import { getBlockDefinition } from '../../../layouts-blocks/registry';
import { resolveGridCellCapacity } from '../../../layouts-blocks/utils/gridDimensions';
import { isGridLayout } from './layoutChildren';
import {
    buildComponentAdjacency,
    buildComponentIndex,
    isComponentInSubtree,
    measureComponentDepth,
    measureSubtreeHeight,
} from './componentTree';
// #endregion

/**
 * Whether the component accepts children into its own `children`.
 *
 * By the definition in the registry rather than by `type === 'layout'`: among the
 * layout blocks there are leaf ones (a text, an image, a space), and they are
 * layout blocks too. Their `children` would go nowhere — the block renders no
 * children at all.
 *
 * @param component - Candidate for the parent.
 * @returns true when the block is a container.
 */
function isContainerComponent(component: IBricksComponent): boolean {
    return getBlockDefinition(component.componentName)?.hasChildren === true;
}

/**
 * Whether the Grid still has a free cell for one more child.
 *
 * A rearrangement inside the same Grid is allowed even in a full one: the number
 * of children does not change. Children hidden on the current device are counted
 * — they keep their cell in the schema, and a device is a matter of visibility,
 * not of belonging.
 *
 * @param target - Grid the component is moved into.
 * @param sourceId - Component being moved.
 * @param viewport - Viewport the cells are counted for.
 * @returns true when the move fits the declared cells.
 */
function fitsGridCapacity(
    target: IBricksComponent,
    sourceId: string | null,
    viewport: string
): boolean {
    const children = target.children ?? [];

    if (sourceId !== null && children.includes(sourceId)) {
        return true;
    }

    return children.length < resolveGridCellCapacity(target, viewport);
}

/**
 * Checks the destination of a move: that the parent exists, accepts children and
 * has room.
 *
 * @param byId - Index of the components by id.
 * @param destination - Destination of the move.
 * @param sourceId - Component being moved, or null when it does not exist yet (a block
 * out of the library): then no "it is already here" exemption applies to it.
 * @param viewport - Viewport for the capacity of a Grid (optional).
 * @returns The verdict on the destination alone.
 */
function checkDestination(
    byId: Map<string, IBricksComponent>,
    destination: TComponentMoveDestination,
    sourceId: string | null,
    viewport: string | undefined
): TComponentPlacementDecision {
    if (destination.kind === 'root') {
        return { allowed: true };
    }

    const target = byId.get(destination.parentId);

    if (!target) {
        return { allowed: false, reason: 'target-not-found' };
    }

    if (destination.kind === 'slot') {
        const slot = target.slots?.find((item) => item.name === destination.slotName);

        if (!slot) {
            return { allowed: false, reason: 'slot-not-found' };
        }

        const isAlreadyInSlot = sourceId !== null && slot.children.includes(sourceId);

        if (slot.allowMultiple === false && slot.children.length > 0 && !isAlreadyInSlot) {
            return { allowed: false, reason: 'slot-capacity' };
        }

        return { allowed: true };
    }

    if (!isContainerComponent(target)) {
        return { allowed: false, reason: 'target-not-container' };
    }

    // The Grid is recognized through the registry and not by the string: a schema
    // is free to name it `grid`, the registry resolves the case itself, and a
    // comparison of its own would let a full grid through on an imported page
    if (
        viewport !== undefined &&
        isGridLayout(target.componentName) &&
        !fitsGridCapacity(target, sourceId, viewport)
    ) {
        return { allowed: false, reason: 'grid-capacity' };
    }

    return { allowed: true };
}

/**
 * Decides whether a NEW component may be put into the destination — a block dragged in
 * from the library, which is not in the schema yet.
 *
 * A separate entry point rather than a move with an empty source: half of the move checks
 * (a cycle, an ancestor into its own descendant, the height of the travelling subtree)
 * have nothing to look at here, while the other half — a container, the room in a slot and
 * in a Grid, the depth of the schema — decides exactly the same way. Without this the drop
 * zones let every library drag through: the canvas promised a place in an occupied single
 * slot, and the store then refused it.
 *
 * @param query - The schema, the destination and (optionally) the viewport.
 * @returns Permission, or a refusal with a machine-readable reason.
 */
export function evaluateComponentInsertion({
    components,
    destination,
    viewport,
}: IComponentInsertionQuery): TComponentPlacementDecision {
    const byId = buildComponentIndex(components);
    const destinationCheck = checkDestination(byId, destination, null, viewport);

    if (!destinationCheck.allowed) {
        return destinationCheck;
    }

    if (destination.kind === 'root') {
        return { allowed: true };
    }

    const targetDepth = measureComponentDepth(byId, destination.parentId);

    if (targetDepth === null) {
        // The graph is already corrupted, and a permission granted by a number pulled out
        // of a cycle is a guess
        return { allowed: false, reason: 'invalid-graph' };
    }

    // A block from the library arrives as a leaf, so its own height is zero — unlike a
    // move, where the whole subtree travels
    if (targetDepth + 1 >= MAX_COMPONENT_TREE_DEPTH) {
        return { allowed: false, reason: 'depth-limit' };
    }

    return { allowed: true };
}

/**
 * Decides whether the move is permitted.
 *
 * @param query - The schema, the component being moved, the destination and
 * (optionally) the viewport.
 * @returns Permission, or a refusal with a machine-readable reason.
 */
export function evaluateComponentMove({
    components,
    sourceId,
    destination,
    viewport,
}: IComponentMoveQuery): TComponentPlacementDecision {
    const byId = buildComponentIndex(components);

    if (!byId.has(sourceId)) {
        return { allowed: false, reason: 'source-not-found' };
    }

    const destinationCheck = checkDestination(byId, destination, sourceId, viewport);

    if (!destinationCheck.allowed) {
        return destinationCheck;
    }

    if (destination.kind === 'root') {
        // The root level cannot be a descendant of anything, and the depth of the
        // subtree only goes down there
        return { allowed: true };
    }

    if (destination.parentId === sourceId) {
        return { allowed: false, reason: 'self' };
    }

    const adjacency = buildComponentAdjacency(components);

    if (isComponentInSubtree(adjacency, sourceId, destination.parentId)) {
        // A component inside its own subtree: the branch would close on itself and
        // drop out of the tree — the renderer would not reach it, and the schema
        // contract would refuse the save
        return { allowed: false, reason: 'descendant' };
    }

    const subtreeHeight = measureSubtreeHeight(adjacency, sourceId);
    const targetDepth = measureComponentDepth(byId, destination.parentId);

    if (subtreeHeight.hasCycle || targetDepth === null) {
        // The graph is already corrupted: the height and the depth have no value,
        // and a permission granted by a number pulled out of a cycle is a guess
        return { allowed: false, reason: 'invalid-graph' };
    }

    if (targetDepth + 1 + subtreeHeight.height >= MAX_COMPONENT_TREE_DEPTH) {
        // The whole subtree travels, so it is its height that decides, not the
        // depth of the destination alone. The limit of the contract is counted from
        // a root of depth 0, and the depth equal to the limit is already refused
        return { allowed: false, reason: 'depth-limit' };
    }

    return { allowed: true };
}
