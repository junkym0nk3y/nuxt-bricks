/**
 * @vitest-environment happy-dom
 */

/**
 * The collapsed groups of the component library: the choice outlives the panel, and a
 * filter never hides a match inside a collapsed group.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it } from 'vitest';

// Vue
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';

// Types
import type { IUseSidebarLibraryCollapseReturn } from '../../src/runtime/modules/builder/shell/sidebar/types/composables';

// Composables
import { useSidebarLibraryCollapse } from '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarLibraryCollapse';
// #endregion

/**
 * Opens the library panel: mounts a host that runs the composable.
 *
 * @param query - The search query of the panel.
 * @param favoritesOnly - The favorites filter of the panel.
 * @returns The composable and the unmount of the panel.
 */
function openPanel(
    query: Ref<string> = ref(''),
    favoritesOnly: Ref<boolean> = ref(false)
): {
    collapse: IUseSidebarLibraryCollapseReturn;
    close: () => void;
} {
    let collapse: IUseSidebarLibraryCollapseReturn | null = null;
    const wrapper = mount(
        defineComponent({
            setup() {
                collapse = useSidebarLibraryCollapse({
                    searchQuery: query,
                    showFavoritesOnly: favoritesOnly,
                });

                return () => null;
            },
        })
    );

    if (!collapse) {
        throw new Error('The composable did not run');
    }

    return { collapse, close: () => wrapper.unmount() };
}

describe('useSidebarLibraryCollapse', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('keeps a collapsed group collapsed on the next opening of the panel', () => {
        const first = openPanel();
        first.collapse.setCategoryOpen('Layout', false);
        first.close();

        const { collapse } = openPanel();

        expect(collapse.isCategoryOpen('Layout')).toBe(false);
        expect(collapse.isCategoryOpen('Promo')).toBe(true);
    });

    it('expands every group during a search and gives the stored choice back after it', async () => {
        const query = ref('');
        const { collapse } = openPanel(query);
        collapse.setCategoryOpen('Layout', false);

        query.value = 'hero';
        await nextTick();
        expect(collapse.isCategoryOpen('Layout')).toBe(true);

        // A toggle during the search lasts until the query changes and is not stored
        collapse.setCategoryOpen('Promo', false);
        expect(collapse.isCategoryOpen('Promo')).toBe(false);
        query.value = 'her';
        await nextTick();
        expect(collapse.isCategoryOpen('Promo')).toBe(true);

        query.value = '';
        await nextTick();
        expect(collapse.isCategoryOpen('Layout')).toBe(false);
        expect(collapse.isCategoryOpen('Promo')).toBe(true);
        expect(
            JSON.parse(localStorage.getItem('bricks-collapsed-library-categories') ?? '[]')
        ).toEqual(['Layout']);
    });

    it('expands a collapsed group under the favorites filter as well', async () => {
        const favoritesOnly = ref(false);
        const { collapse } = openPanel(ref(''), favoritesOnly);
        collapse.setCategoryOpen('Layout', false);

        favoritesOnly.value = true;
        await nextTick();
        expect(collapse.isCategoryOpen('Layout')).toBe(true);

        favoritesOnly.value = false;
        await nextTick();
        expect(collapse.isCategoryOpen('Layout')).toBe(false);
    });
});
