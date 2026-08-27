/**
 * Operations shared by the list property editors of the sidebar (the accordion and
 * the gallery).
 *
 * Two guarantees are worth a test of their own here. An operation aimed outside the
 * list writes nothing at all: a blocked move used to be answered with a write of the
 * very same list, and a write is what wakes the history and the autosave. And no
 * operation touches the incoming array or the objects in it — the list is rendered
 * with a key of its own, and an edit in place would move the DOM row under a person
 * typing in it.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { computed, ref } from 'vue';

// Composable
import { useEditableItemsList } from '../../src/runtime/modules/builder/shell/sidebar/composables/useEditableItemsList';
// #endregion

// #region Data
interface IListItem {
    id: string;
    title: string;
    tags?: string[];
}

/**
 * Builds the composable over a list held in a ref, together with the spy the new
 * list arrives in.
 *
 * @param source - Initial items of the list.
 * @returns The operations, the spy and the reactive list they read.
 */
function createList(source: IListItem[]) {
    const items = ref(source);
    const onUpdate = vi.fn();
    const list = useEditableItemsList<IListItem>({
        items: computed(() => items.value),
        onUpdate,
    });

    return { list, onUpdate, items };
}

const ITEMS: IListItem[] = [
    { id: 'first', title: 'First' },
    { id: 'second', title: 'Second' },
    { id: 'third', title: 'Third' },
];
// #endregion

describe('useEditableItemsList', () => {
    it('removes the item at the index and leaves the source list alone', () => {
        const { list, onUpdate, items } = createList([...ITEMS]);

        list.removeItem(1);

        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate.mock.calls[0][0].map((item: IListItem) => item.id)).toEqual([
            'first',
            'third',
        ]);
        expect(items.value.map((item) => item.id)).toEqual(['first', 'second', 'third']);
    });

    it('writes nothing when the removal points outside the list', () => {
        const { list, onUpdate } = createList([...ITEMS]);

        list.removeItem(-1);
        list.removeItem(3);

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('moves the item past its neighbor in both directions', () => {
        const { list, onUpdate } = createList([...ITEMS]);

        list.moveItem(2, -1);
        expect(onUpdate.mock.calls[0][0].map((item: IListItem) => item.id)).toEqual([
            'first',
            'third',
            'second',
        ]);

        list.moveItem(0, 1);
        expect(onUpdate.mock.calls[1][0].map((item: IListItem) => item.id)).toEqual([
            'second',
            'first',
            'third',
        ]);
    });

    it('writes nothing when the move would leave the list', () => {
        const { list, onUpdate } = createList([...ITEMS]);

        list.moveItem(0, -1);
        list.moveItem(2, 1);

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('writes nothing when the item to move is not in the list', () => {
        const { list, onUpdate } = createList([...ITEMS]);

        // The destination of such a move lands INSIDE the list, so a check of the
        // destination alone lets it through: `splice` then takes nothing out of the
        // list and puts that nothing back in, and the list comes back one hole longer
        list.moveItem(ITEMS.length, -1);

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('replaces only the edited item and keeps the identity of its neighbors', () => {
        const { list, onUpdate, items } = createList([...ITEMS]);

        list.updateField(1, 'title', 'Renamed');

        const next = onUpdate.mock.calls[0][0] as IListItem[];
        expect(next[1]).toEqual({ id: 'second', title: 'Renamed' });
        expect(next[0]).toBe(items.value[0]);
        expect(next[2]).toBe(items.value[2]);
        expect(items.value[1].title).toBe('Second');
    });

    it('writes nothing when the edited index is outside the list', () => {
        const { list, onUpdate } = createList([...ITEMS]);

        list.updateField(5, 'title', 'Renamed');

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('hands the new list to the owner of the value as it is', () => {
        const { list, onUpdate } = createList([...ITEMS]);
        const replacement: IListItem[] = [{ id: 'only', title: 'Only' }];

        list.updateItems(replacement);

        expect(onUpdate).toHaveBeenCalledWith(replacement);
    });
});
