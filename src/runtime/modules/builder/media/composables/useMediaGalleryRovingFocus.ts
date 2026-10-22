/**
 * The single tab stop of the media library grid.
 *
 * A grid is walked with the arrow keys, not with Tab: only one of its cells
 * belongs to the tab order, and the arrows move that place along. Before this the
 * grid carried `tabindex="0"` on EVERY tile, so a library of a hundred files was
 * a hundred tab stops on the way to whatever came after the grid.
 *
 * The active cell is deliberately not the selected one. Selection is the choice
 * of a file and belongs to the caller (`selectedItemId`); the active cell is
 * only "where the keyboard stands", and walking with the arrows must not change
 * what is chosen. They meet at two points: the grid opens standing on the
 * selected file, and a new selection from the outside takes the place with it.
 *
 * Focus is never moved from here. A watcher calling `.focus()` would take the
 * caret out of the search field the moment its filter changed the list — the
 * place in the tab order is enough, the browser does the rest.
 */

// #region Imports
// Types
import type {
    IMediaGalleryRovingFocusOptions,
    IMediaGalleryRovingFocusReturn,
} from '../types/composables';

// Vue
import { ref, watch } from 'vue';
// #endregion

/**
 * Keeps the id of the option that holds the tab stop of the grid.
 *
 * @param options - The items of the grid and the id selected by the caller.
 * @returns The active option id and the check of a given item against it.
 */
export function useMediaGalleryRovingFocus(
    options: IMediaGalleryRovingFocusOptions
): IMediaGalleryRovingFocusReturn {
    const activeItemId = ref<string | null>(null);

    /**
     * The ids of the grid in their current order.
     *
     * @returns The ids as strings — the tab stop of the primitive is addressed by
     * a string, while the media items are numbered.
     */
    function currentIds(): string[] {
        return options.items().map((item) => String(item.id));
    }

    /**
     * The id selected by the caller, as a string.
     *
     * @returns The selected id, or null when nothing is selected.
     */
    function selectedId(): string | null {
        const selected = options.selectedItemId();

        return selected === null ? null : String(selected);
    }

    watch(
        () => currentIds().join(','),
        (nextKey, previousKey) => {
            const ids = nextKey === '' ? [] : nextKey.split(',');

            if (ids.length === 0) {
                activeItemId.value = null;

                return;
            }

            if (activeItemId.value && ids.includes(activeItemId.value)) {
                return;
            }

            const selected = selectedId();
            if (selected && ids.includes(selected)) {
                activeItemId.value = selected;

                return;
            }

            // The active cell is gone — a filter narrowed the list or the file
            // was deleted. The neighbor by the former place keeps the keyboard
            // where the person left it; the tail of the list falls back to its
            // last cell
            const previousIds = !previousKey ? [] : previousKey.split(',');
            const previousIndex = activeItemId.value ? previousIds.indexOf(activeItemId.value) : -1;

            activeItemId.value =
                previousIndex >= 0 ? ids[Math.min(previousIndex, ids.length - 1)] : ids[0];
        },
        { immediate: true }
    );

    watch(
        () => selectedId(),
        (selected) => {
            if (selected && currentIds().includes(selected)) {
                activeItemId.value = selected;
            }
        }
    );

    return {
        activeItemId,

        /**
         * Whether the item holds the tab stop of the grid.
         *
         * @param itemId - The id of the media item.
         * @returns True for the active option.
         */
        isActiveItem(itemId: number): boolean {
            return activeItemId.value === String(itemId);
        },
    };
}
