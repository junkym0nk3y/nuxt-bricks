// #region Imports
// Types
import type { IBricksComponent } from '../../common/types/brick';
// #endregion

/**
 * Builds the "id → component" index of a page schema.
 *
 * The FIRST occurrence of an id wins, and that is the whole reason this is a loop
 * and not `new Map(components.map(...))`: the ids of a stored schema can repeat
 * (the contract forbids it, the render does not enforce it), and a plain Map
 * constructor keeps the LAST duplicate. Resolving a child reference used to be a
 * linear `find`, which answers with the first one — flipping that would silently
 * swap which of two same-id components a container renders.
 *
 * @param components - Flat list of the renderable schema components.
 * @returns The index of components by id, first occurrence per id.
 */
export function buildRendererComponentIndex(
    components: readonly IBricksComponent[]
): ReadonlyMap<string, IBricksComponent> {
    const componentIndex = new Map<string, IBricksComponent>();

    for (const component of components) {
        if (!componentIndex.has(component.id)) {
            componentIndex.set(component.id, component);
        }
    }

    return componentIndex;
}
