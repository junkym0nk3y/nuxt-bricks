/**
 * Walking the component graph of a schema (pure functions over a flat list).
 *
 * The graph is read as an ADJACENCY of three sources at once: `children`, the
 * `children` of every slot, and the back reference `parent` of the components
 * themselves. Any single source is not enough on its own — the three go out of
 * sync in a hand-imported schema and in a draft interrupted midway, and a walk
 * over `children` alone would then miss a link that the schema contract
 * (`validateSchemaComponentGraph`) does see.
 *
 * Everything here has to survive an already corrupted graph: a cycle, a
 * component with two parents, a reference to a missing id. Hence the explicit
 * states of the walk instead of one set of visited nodes — a cycle must be
 * REPORTED and not silently give a smaller height.
 */

// #region Imports
// Types
import type { IBricksComponent } from '../../../common/types/brick';
import type { TComponentSubtreeHeight } from '../types/componentMove';
// #endregion

/**
 * Builds the index of components by id.
 *
 * @param components - Flat list of the schema components.
 * @returns The map of components by id.
 */
export function buildComponentIndex(
    components: readonly IBricksComponent[]
): Map<string, IBricksComponent> {
    return new Map(components.map((component) => [component.id, component]));
}

/**
 * Builds the adjacency of the graph: the direct children of every component out
 * of all three sources of the links.
 *
 * @param components - Flat list of the schema components.
 * @returns The map "component id → ids of its direct children".
 */
export function buildComponentAdjacency(
    components: readonly IBricksComponent[]
): Map<string, Set<string>> {
    const adjacency = new Map<string, Set<string>>();

    /**
     * Adds an edge, creating the set of children on the first one.
     *
     * @param parentId - Id of the parent.
     * @param childId - Id of the child.
     */
    function addEdge(parentId: string, childId: string): void {
        if (!childId) {
            return;
        }

        // A self-reference is NOT dropped: a component listing itself among its own
        // children is a corrupted draft, and hiding the edge would let the walk
        // report a height instead of a cycle — that is, permit a move the schema
        // contract would then refuse

        const children = adjacency.get(parentId);

        if (children) {
            children.add(childId);

            return;
        }

        adjacency.set(parentId, new Set([childId]));
    }

    components.forEach((component) => {
        component.children?.forEach((childId) => addEdge(component.id, childId));
        component.slots?.forEach((slot) => {
            slot.children.forEach((childId) => addEdge(component.id, childId));
        });

        if (component.parent) {
            addEdge(component.parent, component.id);
        }
    });

    return adjacency;
}

/**
 * Whether the component is a descendant of the given ancestor (or is the
 * ancestor itself).
 *
 * The walk goes DOWN the adjacency rather than up the `parent` chain: a
 * corrupted draft is free to hold a child whose `parent` is empty while the
 * container still lists it in `children`, and an upward walk would not see such
 * a link.
 *
 * @param adjacency - Adjacency of the graph.
 * @param ancestorId - Id of the supposed ancestor.
 * @param candidateId - Id of the component being checked.
 * @returns true when the candidate lies inside the ancestor subtree.
 */
export function isComponentInSubtree(
    adjacency: Map<string, Set<string>>,
    ancestorId: string,
    candidateId: string
): boolean {
    if (ancestorId === candidateId) {
        return true;
    }

    const queue = [ancestorId];
    const visited = new Set<string>([ancestorId]);

    while (queue.length > 0) {
        const currentId = queue.shift() as string;

        for (const childId of adjacency.get(currentId) ?? []) {
            if (childId === candidateId) {
                return true;
            }

            if (!visited.has(childId)) {
                visited.add(childId);
                queue.push(childId);
            }
        }
    }

    return false;
}

/**
 * Height of a subtree in edges: a component with no children is 0.
 *
 * A cycle inside the subtree is reported separately rather than folded into a
 * number: on a cycle the height has no value at all, and returning the largest
 * one found would let a move through that the schema contract then rejects on
 * save. That is why the walk keeps three states — untouched, on the current
 * path, finished — and one set of visited nodes would not do.
 *
 * @param adjacency - Adjacency of the graph.
 * @param rootId - Root of the subtree.
 * @returns The height, or the mark that the subtree holds a cycle.
 */
export function measureSubtreeHeight(
    adjacency: Map<string, Set<string>>,
    rootId: string
): TComponentSubtreeHeight {
    const heightById = new Map<string, number>();
    const onPath = new Set<string>();
    let hasCycle = false;

    /**
     * Depth-first walk with memoization of the already measured subtrees.
     *
     * @param id - Id of the component.
     * @returns The height of its subtree.
     */
    function walk(id: string): number {
        const measured = heightById.get(id);

        if (measured !== undefined) {
            return measured;
        }

        if (onPath.has(id)) {
            hasCycle = true;

            return 0;
        }

        onPath.add(id);

        let height = 0;

        for (const childId of adjacency.get(id) ?? []) {
            height = Math.max(height, walk(childId) + 1);
        }

        onPath.delete(id);
        heightById.set(id, height);

        return height;
    }

    const height = walk(rootId);

    return hasCycle ? { hasCycle: true } : { hasCycle: false, height };
}

/**
 * Depth of a component in the tree: a root one is 0.
 *
 * The walk goes up the `parent` chain — that is the direction the depth of the
 * schema contract is counted in. A cycle in the chain is reported, otherwise a
 * corrupted draft would give an arbitrary finite depth.
 *
 * @param byId - Index of the components by id.
 * @param componentId - Id of the component.
 * @returns The depth, or null when the chain holds a cycle.
 */
export function measureComponentDepth(
    byId: Map<string, IBricksComponent>,
    componentId: string
): number | null {
    const seen = new Set<string>([componentId]);
    let depth = 0;
    let currentId = byId.get(componentId)?.parent;

    while (currentId) {
        if (seen.has(currentId)) {
            return null;
        }

        seen.add(currentId);
        depth += 1;
        currentId = byId.get(currentId)?.parent;
    }

    return depth;
}
