/**
 * Where a component stands among its siblings — the single answer for every surface
 * that reorders blocks: the context menu of the canvas, the step actions of the store
 * and the edge drop zones of the schema tree.
 *
 * One resolver and not a copy per surface, because a copy per surface is how they
 * diverged: all three looked into `parent.children` alone, while a child of a slot lies
 * in `parent.slots[].children`. The step commands then did nothing at all for such a
 * child, and the menu could not even offer them — a brick component carries no
 * `children` array, so the two items stayed permanently disabled while dragging the
 * same block inside its slot reordered it just fine.
 *
 * The order of the root level is deliberately not handed out as an array: it lives in
 * the flat `components` list, and rewriting it is the store's business
 * (`moveComponentToRoot`).
 */

// #region Imports
// Types
import type { IBricksComponent } from '../../../common/types/brick';
import type { TComponentSiblingContext } from '../types/componentMove';

// Utils
import { buildComponentIndex } from './componentTree';
// #endregion

/**
 * Position of a component among the top-level ones.
 *
 * @param components - The whole schema.
 * @param id - Id of the component.
 * @returns The root context, or null when the component is not at the root level.
 */
function resolveRootContext(
    components: readonly IBricksComponent[],
    id: string
): TComponentSiblingContext | null {
    const roots = components.filter((component) => !component.parent);
    const index = roots.findIndex((component) => component.id === id);

    if (index === -1) {
        return null;
    }

    return { destination: { kind: 'root' }, index, count: roots.length, children: null };
}

/**
 * Every list of the parent that names the component, as the sibling contexts they would
 * give.
 *
 * Both list kinds are walked instead of trusting `component.slotName`, because the
 * forward lists are what the interface is built from: the canvas renders a slot out of
 * `slots[].children` and a container out of `children`, so the list holding the id IS
 * the row of neighbors the user sees. `slotName` is a back-reference, it is not
 * validated by the schema contract, and an imported page may carry a stale one — taking
 * it for the authority would leave an ordinary child of a container with no siblings at
 * all.
 *
 * @param parent - Parent component.
 * @param id - Id of the child.
 * @returns One entry per list naming the child; normally exactly one.
 */
function collectMemberships(parent: IBricksComponent, id: string): TComponentSiblingContext[] {
    const memberships: TComponentSiblingContext[] = [];
    const childIndex = parent.children?.indexOf(id) ?? -1;

    if (parent.children && childIndex !== -1) {
        memberships.push({
            destination: { kind: 'layout', parentId: parent.id },
            index: childIndex,
            count: parent.children.length,
            children: parent.children,
        });
    }

    parent.slots?.forEach((slot) => {
        const slotIndex = slot.children.indexOf(id);

        if (slotIndex === -1) {
            return;
        }

        memberships.push({
            destination: { kind: 'slot', parentId: parent.id, slotName: slot.name },
            index: slotIndex,
            count: slot.children.length,
            children: slot.children,
        });
    });

    return memberships;
}

/**
 * Finds the list a component lies in, its position there and the destination a sibling
 * drop next to it lands in.
 *
 * Membership is decided by the lists of the parent, not by `slotName`: a component named
 * by exactly one of them has that list for its neighbors, whatever the back-reference
 * says. Two lists naming the same id give `null` — the graph is already damaged, and
 * rearranging one of the two would write that damage down instead of it being repaired.
 *
 * @param components - The whole schema.
 * @param id - Id of the component.
 * @returns The position among the siblings, or null when the component has no place in
 * the graph.
 */
export function resolveComponentSiblingContext(
    components: readonly IBricksComponent[],
    id: string
): TComponentSiblingContext | null {
    const byId = buildComponentIndex(components);
    const component = byId.get(id);

    if (!component) {
        return null;
    }

    if (!component.parent) {
        return resolveRootContext(components, id);
    }

    const parent = byId.get(component.parent);

    if (!parent) {
        return null;
    }

    const memberships = collectMemberships(parent, id);

    return memberships.length === 1 ? memberships[0] : null;
}
