// #region Imports
// Types
import type {
    IUseEditableItemsListOptions,
    IUseEditableItemsListReturn,
} from '../types/composables';
// #endregion

/**
 * Operations of a list of objects edited by a property editor: removal, reordering
 * and a write into a single field of one item.
 *
 * The composable knows neither the shape of an item nor the interface around it. The
 * shape belongs to the editor: adding an item, choosing a file, deciding which fields
 * are shown at all — everything that has to know what a "gallery image" or an
 * "accordion section" is stays in the SFC.
 *
 * Nothing here mutates the incoming array or the objects in it. That array is the
 * value the store holds, and the store is the only writer: it replaces the props of
 * the component and schedules the save into the history. An edit in place would reach
 * the canvas through reactivity all the same, and the change would end up in no
 * history entry at all — undo would step over it.
 *
 * @param options - The list itself and the callback that receives the new one.
 * @returns The operations of the list.
 */
export function useEditableItemsList<T extends object>(
    options: IUseEditableItemsListOptions<T>
): IUseEditableItemsListReturn<T> {
    /**
     * Copies the array, keeping the identity of the items: only the item an operation
     * actually changes is replaced, and the rest travel on as they are.
     *
     * @returns A shallow copy of the current list.
     */
    function cloneItems(): T[] {
        return [...options.items.value];
    }

    /**
     * Hands the new list to the owner of the value.
     *
     * @param items - The list as it should become.
     */
    function updateItems(items: T[]): void {
        options.onUpdate(items);
    }

    /**
     * Removes the item at the index.
     *
     * @param index - Index of the item to remove.
     */
    function removeItem(index: number): void {
        if (index < 0 || index >= options.items.value.length) {
            return;
        }

        const next = cloneItems();
        next.splice(index, 1);
        updateItems(next);
    }

    /**
     * Moves the item one position in the given direction. A move past either end of
     * the list is refused rather than clamped: the buttons at the ends are blocked,
     * and a silent clamp would answer a blocked press with a write of the same list.
     *
     * Both indexes are checked, not just the destination: a source index past the end
     * of the list has a destination inside it, and `splice` would then take nothing
     * out and put that nothing back in — the list would grow by a hole.
     *
     * @param index - Index of the item to move.
     * @param direction - -1 to move up the list, 1 to move down it.
     */
    function moveItem(index: number, direction: -1 | 1): void {
        const length = options.items.value.length;
        const targetIndex = index + direction;
        if (index < 0 || index >= length || targetIndex < 0 || targetIndex >= length) {
            return;
        }

        const next = cloneItems();
        const [item] = next.splice(index, 1);
        next.splice(targetIndex, 0, item);
        updateItems(next);
    }

    /**
     * Writes a value into a single field of one item.
     *
     * @param index - Index of the item.
     * @param field - Field being edited.
     * @param value - New value of the field.
     */
    function updateField<K extends keyof T>(index: number, field: K, value: T[K]): void {
        const current = options.items.value[index];
        if (!current) {
            return;
        }

        const next = cloneItems();
        next[index] = { ...current, [field]: value };
        updateItems(next);
    }

    return { updateItems, removeItem, moveItem, updateField };
}
