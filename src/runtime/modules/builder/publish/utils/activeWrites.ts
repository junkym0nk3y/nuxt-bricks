/**
 * The registry of the unfinished write operations of the current landing.
 *
 * A list of identifiers rather than one shared boolean: an operation outlives a
 * change of page in the builder, and the `finally` of the first one would clear
 * the indicator of the second. Ownership by id closes the reverse case too — an
 * operation of an abandoned page must not block a write on the open one: its id
 * is swept away by the reset on a session change.
 */
import type { IActiveWriteRegistry } from '../types/publishStore';

/**
 * Opens a write operation. A refusal (`null`) means a write is already running:
 * the second submit must not reach the server at all.
 *
 * The ban is held here rather than on the `disabled` of the button: that one
 * depends on whether Vue managed to repaint the markup between two actions, and
 * it does not extend to a direct call of the store action.
 *
 * @param registry - Registry state (the store).
 * @returns The operation identifier, or `null` when a write is already running.
 */
export function beginActiveWrite(registry: IActiveWriteRegistry): number | null {
    if (registry.activeWriteIds.length > 0) {
        return null;
    }

    // The counter is monotonic and a reset of the registry does not zero it: a
    // reissued id would let a late completion of the previous operation clear
    // the new one
    registry.nextWriteId += 1;
    registry.activeWriteIds = [...registry.activeWriteIds, registry.nextWriteId];

    return registry.nextWriteId;
}

/**
 * Closes a write operation. Its own one specifically: clearing the whole list
 * would mean that the completion of an operation of an abandoned page clears the
 * indicator of the write running on the open one.
 *
 * @param registry - Registry state (the store).
 * @param writeId - The identifier issued by `beginActiveWrite`.
 */
export function endActiveWrite(registry: IActiveWriteRegistry, writeId: number): void {
    registry.activeWriteIds = registry.activeWriteIds.filter((activeId) => activeId !== writeId);
}
