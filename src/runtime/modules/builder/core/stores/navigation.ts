// #region Imports
// Types
import type {
    INavigationItem,
    INavigationMeta,
    IBricksSchemaMeta,
} from '../../../common/types/brick';

// Utils
import { generateNavigationItemId } from '../utils/ids';

// Vue
import { ref, computed } from 'vue';

// Pinia
import { defineStore } from 'pinia';
// #endregion

/**
 * Owns the navigation entries of the landing page.
 * The data is stored in schema.meta.navigation and is readable by the custom
 * components of the site.
 */
export const useNavigationStore = defineStore('bricksNavigation', () => {
    // #region State
    const items = ref<INavigationItem[]>([]);
    // #endregion

    // #region Getters
    /**
     * Whether there is at least one navigation entry.
     */
    const hasItems = computed<boolean>(() => items.value.length > 0);

    // #endregion

    // #region Actions
    /**
     * Loads the navigation out of schema.meta.
     *
     * @param meta - The meta object of an IBricksSchema.
     */
    function loadFromMeta(meta?: IBricksSchemaMeta): void {
        const navItems = meta?.navigation?.items;
        items.value = Array.isArray(navItems) ? navItems.map((item) => ({ ...item })) : [];
    }

    /**
     * Adds a navigation entry.
     *
     * @param target - An anchor (#section-id) or a URL.
     * @param label - Text shown to the visitor.
     */
    function addItem(target: string, label: string): void {
        items.value = [
            ...items.value,
            {
                id: generateNavigationItemId(),
                target,
                label,
            },
        ];
    }

    /**
     * Removes a navigation entry by id.
     *
     * @param id - Id of the entry.
     */
    function removeItem(id: string): void {
        items.value = items.value.filter((item) => item.id !== id);
    }

    /**
     * Updates the fields of a navigation entry.
     *
     * @param id - Id of the entry.
     * @param updates - Partial update (target and/or label).
     */
    function updateItem(
        id: string,
        updates: Partial<Pick<INavigationItem, 'target' | 'label'>>
    ): void {
        items.value = items.value.map((item) => (item.id === id ? { ...item, ...updates } : item));
    }

    /**
     * Moves an entry from one position to another.
     *
     * @param fromIndex - Position moved from.
     * @param toIndex - Position moved to.
     */
    function reorderItems(fromIndex: number, toIndex: number): void {
        if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= items.value.length ||
            toIndex >= items.value.length ||
            fromIndex === toIndex
        ) {
            return;
        }

        const updated = [...items.value];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        items.value = updated;
    }

    /**
     * Drops every navigation entry.
     */
    function reset(): void {
        items.value = [];
    }

    /**
     * Returns the navigation data to be written into schema.meta.
     *
     * The entries are copied rather than handed over as they are: the result goes
     * into the schema, and passing the live state array would leave the schema
     * sharing references with the store — an edit of the navigation would then
     * silently rewrite a schema already serialized.
     */
    function toMeta(): INavigationMeta {
        return {
            items: items.value.map((item) => ({ ...item })),
        };
    }
    // #endregion

    return {
        items,
        hasItems,
        loadFromMeta,
        addItem,
        removeItem,
        updateItem,
        reorderItems,
        reset,
        toMeta,
    };
});
