/**
 * The category selector of a file — shared by the meta panel of the modal and the
 * details panel of the section.
 *
 * The contract is narrow and lives entirely in its edges: "No category" first with
 * an empty string (the value `BricksSelect` uses for an empty choice), that empty
 * string traveling out as `null` rather than as an empty slug, and silence where
 * there is nothing to change.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IMediaCategory, IMediaItem } from '../../src/runtime/modules/common/types/media';
import type { IMediaCategorySelectHarness } from './types';

// Vue
import { effectScope, ref } from 'vue';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import { useMediaCategorySelect } from '../../src/runtime/modules/builder/media/composables/useMediaCategorySelect';

// #region Helpers
/**
 * A media file with the given category.
 *
 * @param category - The category of the file; null — there is none.
 * @returns The media record.
 */
function makeItem(category: string | null): IMediaItem {
    return {
        id: 1,
        url: 'https://cdn.example.com/a.webp',
        filename: 'a.webp',
        alt: '',
        size: 100,
        uploadedAt: '2026-01-01T00:00:00.000Z',
        mimeType: 'image/webp',
        category,
        svgContent: null,
        width: 800,
        height: 600,
        previewUrl: null,
        mockUrl: null,
    };
}

/**
 * Raises a selector in an effect scope of its own.
 *
 * @param initialCategory - The category of the selected file.
 * @returns The selector and its inputs.
 */
function createSelect(initialCategory: string | null = null): IMediaCategorySelectHarness {
    const item = ref<IMediaItem | null>(makeItem(initialCategory));
    const categories = ref<IMediaCategory[]>([]);
    const changes: (string | null)[] = [];
    const scope = effectScope();
    const select = scope.run(() =>
        useMediaCategorySelect({
            item: () => item.value,
            categories: () => categories.value,
            onChange: (category) => changes.push(category),
        })
    );

    if (!select) {
        throw new Error('The composable returned no selector');
    }

    return { select, item, categories, changes };
}
// #endregion

describe('the category selector: the list of options', () => {
    it('starts with "No category" carrying an empty string', () => {
        const { select, categories } = createSelect();

        categories.value = [{ id: 1, slug: 'promo', label: 'Акции', sortOrder: 1 }];

        expect(select.categoryOptions.value).toEqual([
            { label: 'bricks.media.noCategory', value: '' },
            { label: 'Акции', value: 'promo' },
        ]);
    });

    it('the facets repeat the values of the options', () => {
        const { select, categories } = createSelect();

        categories.value = [
            { id: 1, slug: 'promo', label: 'Акции', sortOrder: 1 },
            { id: 2, slug: 'news', label: 'Новости', sortOrder: 2 },
        ];

        expect(select.categoryFacets.value).toEqual(['', 'promo', 'news']);
    });

    it('a new category reaches the list with no selector rebuilt', () => {
        const { select, categories } = createSelect();

        expect(select.categoryOptions.value).toHaveLength(1);

        categories.value = [{ id: 1, slug: 'promo', label: 'Акции', sortOrder: 1 }];

        expect(select.categoryOptions.value).toHaveLength(2);
    });
});

describe('the category selector: the value it shows', () => {
    it('a file with no category shows an empty string', () => {
        const { select } = createSelect(null);

        expect(select.selectedCategory.value).toBe('');
    });

    it('a change of the file changes the category shown', () => {
        const { select, item } = createSelect('promo');

        expect(select.selectedCategory.value).toBe('promo');

        item.value = makeItem('news');

        expect(select.selectedCategory.value).toBe('news');
    });
});

describe('the category selector: what travels up', () => {
    it('an empty string means the category is taken off, not an empty slug', () => {
        const { select, changes } = createSelect('promo');

        select.handleCategoryChange('');

        expect(changes).toEqual([null]);
    });

    it('the chosen slug travels as it is', () => {
        const { select, changes } = createSelect(null);

        select.handleCategoryChange('promo');

        expect(changes).toEqual(['promo']);
    });

    it('picking the current category again makes no request', () => {
        const { select, changes } = createSelect('promo');

        select.handleCategoryChange('promo');

        expect(changes).toEqual([]);
    });

    it('the kit may hand out a non-string, and it does not reach the server', () => {
        const { select, changes } = createSelect('promo');

        select.handleCategoryChange(null);
        select.handleCategoryChange(42);

        expect(changes).toEqual([]);
    });

    it('a file taken off the screen sends no change after itself', () => {
        const { select, item, changes } = createSelect('promo');

        item.value = null;
        select.handleCategoryChange('news');

        expect(changes).toEqual([]);
    });
});
