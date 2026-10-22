/**
 * The model shared by the two surfaces of the media library: the counters of the
 * track, the filtered list of the grid and the wiring of the actions over the
 * categories.
 *
 * The modal and the dashboard section used to hold a copy each, differing only in
 * where the filter and the search string come from. What is under test here is the
 * model itself: the filter and the query arrive as getters, the command to drop
 * travels back up — and only the category does, because the search of the dashboard
 * is dropped by an action of its own.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IMediaCategory, IMediaItem } from '../../src/runtime/modules/common/types/media';
import type { IMediaCategoryActionsOptions } from '../../src/runtime/modules/builder/media/types/composables';
import type { IMediaGallerySurfaceHarness } from './types';

// Vue
import { effectScope, ref, type Ref } from 'vue';
// #endregion

// #region Mocks
const { mediaStoreBridge, categoryActionsBridge } = vi.hoisted(() => ({
    mediaStoreBridge: {
        store: null as {
            items: IMediaItem[];
            isUploading: boolean;
            hasLoadedItemsSnapshot: boolean;
        } | null,
    },
    categoryActionsBridge: {
        /** The options of every surface raised, in the order they were raised */
        options: [] as IMediaCategoryActionsOptions[],
        categories: null as Ref<IMediaCategory[]> | null,
        handleCreateCategory: null as unknown,
    },
}));

vi.mock('../../src/runtime/modules/builder/media/stores/media', async () => {
    const { reactive } = await import('vue');
    const store = reactive({
        items: [] as IMediaItem[],
        isUploading: false,
        hasLoadedItemsSnapshot: false,
    });

    mediaStoreBridge.store = store;

    return { useMediaStore: () => store };
});

/**
 * The actions over the categories are substituted: what is under test is the wiring,
 * not the actions themselves (their own rights and their own store are checked in
 * `mediaPermissions.spec.ts`). The double hands the options it was given back out —
 * that is how the surface learns about a deletion.
 *
 * The list of categories is shared by every double on purpose: in the application it
 * is the store of categories, one for the whole page. The confirmation refs, on the
 * contrary, are created anew on every call — that is what makes the isolation of two
 * surfaces provable rather than assumed.
 */
vi.mock('../../src/runtime/modules/builder/media/composables/useMediaCategoryActions', async () => {
    const { ref: createRef } = await import('vue');
    const categories = createRef<IMediaCategory[]>([]);
    const handleCreateCategory = vi.fn(() => Promise.resolve());

    categoryActionsBridge.categories = categories;
    categoryActionsBridge.handleCreateCategory = handleCreateCategory;

    return {
        useMediaCategoryActions: (options: IMediaCategoryActionsOptions) => {
            categoryActionsBridge.options.push(options);

            return {
                categories,
                isCreatingCategory: createRef(false),
                categoryPendingDeletion: createRef<string | null>(null),
                isDeletingCategory: createRef(false),
                deleteCategoryTitle: createRef(''),
                deleteCategoryDescription: createRef(''),
                handleCreateCategory,
                handleRequestCategoryDelete: vi.fn(),
                handleCloseCategoryDelete: vi.fn(),
                handleConfirmCategoryDelete: vi.fn(() => Promise.resolve()),
                resetCategoryActions: vi.fn(),
            };
        },
    };
});
// #endregion

import { useMediaGallerySurface } from '../../src/runtime/modules/builder/media/composables/useMediaGallerySurface';

// #region Helpers
/**
 * A media file with the given fields.
 *
 * @param overrides - The fields differing from the base ones.
 * @returns The media record.
 */
function makeItem(overrides: Partial<IMediaItem> = {}): IMediaItem {
    return {
        id: 1,
        url: 'https://cdn.example.com/a.webp',
        filename: 'a.webp',
        alt: '',
        size: 100,
        uploadedAt: '2026-01-01T00:00:00.000Z',
        mimeType: 'image/webp',
        category: null,
        svgContent: null,
        width: 800,
        height: 600,
        previewUrl: null,
        mockUrl: null,
        ...overrides,
    };
}

/**
 * Raises a surface in an effect scope of its own.
 *
 * @returns The surface and its inputs.
 */
function createSurface(): IMediaGallerySurfaceHarness {
    const categoryFilter = ref('all');
    const searchQuery = ref('');
    const resetCalls: string[][] = [];
    const errors: string[] = [];
    const scope = effectScope();
    const surface = scope.run(() =>
        useMediaGallerySurface({
            categoryFilter: () => categoryFilter.value,
            searchQuery: () => searchQuery.value,
            onCategoryFilterReset: () => resetCalls.push([categoryFilter.value, searchQuery.value]),
            onError: (message: string) => errors.push(message),
        })
    );
    const categoryActionsOptions = categoryActionsBridge.options.at(-1);

    if (!surface || !categoryActionsOptions) {
        throw new Error('The composable returned no surface');
    }

    return { surface, categoryFilter, searchQuery, resetCalls, errors, categoryActionsOptions };
}

/**
 * Puts a list of files into the media store.
 *
 * @param items - The files.
 */
function setItems(items: IMediaItem[]): void {
    const store = mediaStoreBridge.store;

    if (!store) {
        throw new Error('The media store is not substituted');
    }

    store.items = items;
}

/**
 * Puts a list of categories into the substituted category actions.
 *
 * @param categories - The categories.
 */
function setCategories(categories: IMediaCategory[]): void {
    const known = categoryActionsBridge.categories;

    if (!known) {
        throw new Error('The category actions are not substituted');
    }

    known.value = categories;
}
// #endregion

beforeEach(() => {
    setItems([]);
    setCategories([]);
    categoryActionsBridge.options = [];

    if (mediaStoreBridge.store) {
        mediaStoreBridge.store.isUploading = false;
        mediaStoreBridge.store.hasLoadedItemsSnapshot = false;
    }
});

describe('the media surface: the counters and the weight', () => {
    it('a file with no category misses the counter, but gives the weight and the presence', () => {
        setItems([
            makeItem({ id: 1, category: null, size: 100 }),
            makeItem({ id: 2, category: 'promo', size: 200 }),
        ]);

        const { surface } = createSurface();

        expect(surface.categoryCounts.value).toEqual({ promo: 1 });
        expect(surface.totalSize.value).toBe(300);
        expect(surface.hasItems.value).toBe(true);
    });

    it('the states of the store travel through as they are', () => {
        const { surface } = createSurface();

        expect(surface.isUploading.value).toBe(false);
        expect(surface.hasLibrarySnapshot.value).toBe(false);

        if (mediaStoreBridge.store) {
            mediaStoreBridge.store.isUploading = true;
            mediaStoreBridge.store.hasLoadedItemsSnapshot = true;
        }

        expect(surface.isUploading.value).toBe(true);
        expect(surface.hasLibrarySnapshot.value).toBe(true);
    });
});

describe('the media surface: the filtering of the grid', () => {
    it('the category and the search join rather than replace one another', () => {
        setItems([
            makeItem({ id: 1, filename: 'promo-hero.webp', category: 'promo' }),
            makeItem({ id: 2, filename: 'promo-hero.webp', category: 'news' }),
        ]);

        const { surface, categoryFilter, searchQuery } = createSurface();

        categoryFilter.value = 'promo';
        searchQuery.value = 'promo-hero';

        expect(surface.filteredMediaItems.value.map((item) => item.id)).toEqual([1]);
        expect(surface.hasFilteredItems.value).toBe(true);
    });

    it('the search runs over the name, the alt and the caption of the category', () => {
        setCategories([{ id: 1, slug: 'promo', label: 'Акции', sortOrder: 1 }]);
        setItems([
            makeItem({ id: 1, filename: 'banner.webp', alt: '', category: null }),
            makeItem({ id: 2, filename: 'x.webp', alt: 'Зимний баннер', category: null }),
            makeItem({ id: 3, filename: 'y.webp', alt: '', category: 'promo' }),
        ]);

        const { surface, searchQuery } = createSurface();

        searchQuery.value = 'banner';
        expect(surface.filteredMediaItems.value.map((item) => item.id)).toEqual([1]);

        searchQuery.value = 'зимний';
        expect(surface.filteredMediaItems.value.map((item) => item.id)).toEqual([2]);

        // The caption, not the slug: what lies in the data is a transliteration, and a
        // search by a caption would find nothing without the list of categories
        searchQuery.value = 'акции';
        expect(surface.filteredMediaItems.value.map((item) => item.id)).toEqual([3]);
    });

    it('an empty result of the filter is seen as a sign of its own', () => {
        setItems([makeItem({ id: 1, category: 'promo' })]);

        const { surface, categoryFilter } = createSurface();

        categoryFilter.value = 'news';

        expect(surface.filteredMediaItems.value).toEqual([]);
        expect(surface.hasFilteredItems.value).toBe(false);
        expect(surface.hasItems.value).toBe(true);
    });
});

describe('the media surface: a deleted category', () => {
    it('the deletion of an inactive category leaves the filter alone', () => {
        const { categoryFilter, categoryActionsOptions, resetCalls } = createSurface();

        categoryFilter.value = 'promo';
        categoryActionsOptions.onCategoryDeleted('news');

        expect(resetCalls).toEqual([]);
    });

    it('the deletion of the active category asks for one drop and spares the search', () => {
        const { categoryFilter, searchQuery, categoryActionsOptions, resetCalls } = createSurface();

        categoryFilter.value = 'promo';
        searchQuery.value = 'баннер';
        categoryActionsOptions.onCategoryDeleted('promo');

        // Only the command to drop the category travels into the callback: the search
        // string is a filter of its own, and a deleted category is none of its business
        expect(resetCalls).toEqual([['promo', 'баннер']]);
    });

    it('the counter of the files of a category is handed to the confirmation', () => {
        setItems([
            makeItem({ id: 1, category: 'promo' }),
            makeItem({ id: 2, category: 'promo' }),
            makeItem({ id: 3, category: 'news' }),
        ]);

        const { categoryActionsOptions } = createSurface();

        expect(categoryActionsOptions.resolveCategoryCount('promo')).toBe(2);
        expect(categoryActionsOptions.resolveCategoryCount('unknown')).toBe(0);
    });

    it('a refusal of the actions over the categories reaches the caller', () => {
        const { categoryActionsOptions, errors } = createSurface();

        categoryActionsOptions.onError('The category could not be deleted');

        expect(errors).toEqual(['The category could not be deleted']);
    });
});

describe('the media surface: two surfaces at once', () => {
    it('the filter of one is not the filter of the other', () => {
        setItems([makeItem({ id: 1, category: 'promo' }), makeItem({ id: 2, category: 'news' })]);

        const modal = createSurface();
        const section = createSurface();

        modal.categoryFilter.value = 'promo';
        section.categoryFilter.value = 'news';

        expect(modal.surface.filteredMediaItems.value.map((item) => item.id)).toEqual([1]);
        expect(section.surface.filteredMediaItems.value.map((item) => item.id)).toEqual([2]);
    });

    it('a deleted category drops the filter of the surface that showed it, and only it', () => {
        const modal = createSurface();
        const section = createSurface();

        modal.categoryFilter.value = 'promo';
        section.categoryFilter.value = 'news';
        modal.categoryActionsOptions.onCategoryDeleted('promo');

        expect(modal.resetCalls).toEqual([['promo', '']]);
        expect(section.resetCalls).toEqual([]);
        // The modal must not close over the section: a model kept at module level
        // would hand both surfaces one and the same reset
        expect(modal.categoryActionsOptions).not.toBe(section.categoryActionsOptions);
    });

    it('a refusal shown by one surface is not shown by the other', () => {
        const modal = createSurface();
        const section = createSurface();

        section.categoryActionsOptions.onError('The category could not be created');

        expect(section.errors).toEqual(['The category could not be created']);
        expect(modal.errors).toEqual([]);
    });
});

describe('the media surface: the set of actions over the categories', () => {
    it('is handed out whole rather than reassembled', () => {
        const { surface } = createSurface();

        expect(surface.handleCreateCategory).toBe(categoryActionsBridge.handleCreateCategory);
        expect(typeof surface.resetCategoryActions).toBe('function');
        expect(typeof surface.handleConfirmCategoryDelete).toBe('function');
    });
});
