// Types
import type {
    IUseSidebarLibraryCollapseOptions,
    IUseSidebarLibraryCollapseReturn,
} from '../types/composables';

// Vue
import { onMounted, ref, watch } from 'vue';

// Nuxt
import { useNuxtApp } from '#imports';

const STORAGE_KEY = 'bricks-collapsed-library-categories';

/**
 * Reads the collapsed categories of the library out of localStorage. Anything but an
 * array of strings reads as none collapsed: the value is the browser's, not ours.
 */
function loadCollapsedCategories(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];

        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === 'string')
            : [];
    } catch {
        return [];
    }
}

/**
 * Stores the collapsed categories of the library in localStorage.
 *
 * @param categories - Names of the collapsed categories.
 */
function saveCollapsedCategories(categories: string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    } catch {
        // A failed write only means the groups open expanded next time
    }
}

/**
 * Which category groups of the component library are collapsed.
 *
 * The choice outlives the panel and a reload: a library of a few dozen bricks is
 * collapsed to get at one category, and doing it again on every opening is what the
 * accordion is meant to spare.
 *
 * A filter does not obey it — the search and the favorites alike. A match inside a
 * collapsed group would be hidden while the list does not read as empty either: the
 * group title is still there. So while a filter is on every group starts expanded, a
 * toggle under the filter lasts until the filter changes, and the stored choice comes
 * back once the filters are off.
 *
 * The stored choice is read at once, except under hydration: the library is rendered
 * on the server already, with no localStorage there, and a different set of groups on
 * the client would break the hydration. Read later, in `onMounted`, it would let the
 * live previews of the groups mount for nothing on every opening of the panel.
 *
 * @param options - The filters of the library.
 */
export function useSidebarLibraryCollapse(
    options: IUseSidebarLibraryCollapseOptions
): IUseSidebarLibraryCollapseReturn {
    const { searchQuery, showFavoritesOnly } = options;
    const isHydrating = useNuxtApp().isHydrating === true;
    const collapsedCategories = ref<string[]>(isHydrating ? [] : loadCollapsedCategories());
    const filterCollapsedCategories = ref<string[]>([]);

    /** Whether a filter is on: its toggles do not touch the stored choice */
    function isFiltering(): boolean {
        return showFavoritesOnly.value || searchQuery.value.trim() !== '';
    }

    /**
     * Whether the group of a category is expanded.
     *
     * @param category - The category name.
     */
    function isCategoryOpen(category: string): boolean {
        const collapsed = isFiltering()
            ? filterCollapsedCategories.value
            : collapsedCategories.value;

        return !collapsed.includes(category);
    }

    /**
     * Expands or collapses the group of a category; outside a filter the choice is
     * stored.
     *
     * @param category - The category name.
     * @param isOpen - Whether the group is to be expanded.
     */
    function setCategoryOpen(category: string, isOpen: boolean): void {
        const target = isFiltering() ? filterCollapsedCategories : collapsedCategories;
        const others = target.value.filter((item) => item !== category);

        target.value = isOpen ? others : [...others, category];

        if (target === collapsedCategories) {
            saveCollapsedCategories(collapsedCategories.value);
        }
    }

    watch([searchQuery, showFavoritesOnly], () => {
        filterCollapsedCategories.value = [];
    });

    onMounted(() => {
        if (isHydrating) {
            collapsedCategories.value = loadCollapsedCategories();
        }
    });

    return { isCategoryOpen, setCategoryOpen };
}
