// #region Imports
// Types
import type { IMediaItem } from '../../../common/types/media';
import type { IMediaGallerySurface, IMediaGallerySurfaceOptions } from '../types/composables';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
import { resolveMediaCategoryLabelBySlug } from '../utils/categoryLabels';
import { matchesMediaPickFilter, resolveMediaKind } from '../../../common/utils/mediaKind';

// Vue
import { computed } from 'vue';

// Pinia
import { useMediaStore } from '../stores/media';

// Composables
import { useMediaCategoryActions } from './useMediaCategoryActions';
// #endregion

/**
 * The model of a media library surface: the counters of the track, the filtered
 * list of the grid and the actions over the categories.
 *
 * One mechanism for two surfaces — the gallery modal and the "Media" section of the
 * dashboard. They differ in where the filter and the search string are held (refs of
 * the modal against props of the section) and in what they draw around the grid;
 * everything between those two ends used to stand in both controllers word for word.
 *
 * The lifecycle is deliberately left to the caller: the modal drops its filters and
 * its confirmations when it closes, and doing that from here would make closing the
 * modal reach into the section of the dashboard.
 *
 * @param options - Where the filter and the search string come from, how the filter
 * is dropped and where an error goes.
 * @returns The counters, the filtered list and the actions over the categories.
 */
export function useMediaGallerySurface(options: IMediaGallerySurfaceOptions): IMediaGallerySurface {
    // #region Data
    const mediaStore = useMediaStore();
    // #endregion

    // #region Computed
    const mediaItems = computed<IMediaItem[]>(() => mediaStore.items);
    const isUploading = computed<boolean>(() => mediaStore.isUploading);
    const hasLibrarySnapshot = computed<boolean>(() => mediaStore.hasLoadedItemsSnapshot);

    /**
     * The files the surface offers at all. The counters and the "the library is empty"
     * state are computed off them rather than off the whole library: a gallery opened
     * for a document over a library of pictures has nothing to offer, and "nothing
     * found, reset the filter" would send the person to a filter that is not theirs to
     * reset.
     */
    const offeredItems = computed<IMediaItem[]>(() => {
        const pickFilter = options.pickFilter();

        return pickFilter
            ? mediaItems.value.filter((item) => matchesMediaPickFilter(item, pickFilter))
            : mediaItems.value;
    });
    const hasItems = computed<boolean>(() => offeredItems.value.length > 0);

    /**
     * The counters of the tabs are computed off the list already loaded — there is no
     * request of their own. Files with no category fall into no counter at all: they
     * are seen under "All" only.
     */
    const categoryCounts = computed<Record<string, number>>(() =>
        offeredItems.value.reduce<Record<string, number>>((counts, item) => {
            if (item.category) {
                counts[item.category] = (counts[item.category] ?? 0) + 1;
            }

            return counts;
        }, {})
    );

    const totalSize = computed<number>(() =>
        mediaItems.value.reduce((sum, item) => sum + item.size, 0)
    );

    /**
     * The actions over the categories. The confirmation of a deletion counts the files
     * of the whole library, not those on offer like the counters of the tabs: the
     * deletion takes the category off every file, and a picker of pictures would
     * understate it by the documents.
     */
    const categoryActions = useMediaCategoryActions({
        resolveCategoryCount: (slug: string) =>
            mediaItems.value.filter((item) => item.category === slug).length,
        onCategoryDeleted: handleCategoryDeleted,
        onError: options.onError,
    });

    /**
     * The filtered list of the grid: the files on offer, the category out of the track,
     * the kind, then the search string.
     *
     * Below `useMediaCategoryActions`, because the search matches against the CAPTION
     * of a category, and the list of captions comes from there. Matching against
     * `item.category` will not do: what lies there is a slug, so a search by a caption
     * would find nothing — the data holds its transliteration.
     */
    const filteredMediaItems = computed<IMediaItem[]>(() => {
        const filterValue = options.categoryFilter();
        const kindFilter = options.kindFilter();
        const query = options.searchQuery().trim().toLowerCase();

        return offeredItems.value.filter((item) => {
            const matchesCategory =
                filterValue === ALL_MEDIA_CATEGORIES_FILTER || item.category === filterValue;
            const matchesKind = !kindFilter || resolveMediaKind(item.mimeType) === kindFilter;
            const matchesSearch =
                !query ||
                item.filename.toLowerCase().includes(query) ||
                item.alt.toLowerCase().includes(query) ||
                Boolean(
                    item.category &&
                    resolveMediaCategoryLabelBySlug(item.category, categoryActions.categories.value)
                        .toLowerCase()
                        .includes(query)
                );

            return matchesCategory && matchesKind && matchesSearch;
        });
    });

    const hasFilteredItems = computed<boolean>(() => filteredMediaItems.value.length > 0);
    // #endregion

    // #region Methods
    /**
     * Drops a filter pointing at a deleted category: otherwise it would refer to
     * something that is gone, and the grid would be left demonstratively empty.
     *
     * Only the category is dropped, and only when it is the one that was deleted: the
     * search string is a filter of its own, and taking it down along the way would
     * throw away a query the deletion has nothing to do with.
     *
     * @param slug - The deleted category.
     */
    function handleCategoryDeleted(slug: string): void {
        if (options.categoryFilter() === slug) {
            options.onCategoryFilterReset();
        }
    }
    // #endregion

    return {
        ...categoryActions,
        mediaItems,
        offeredItems,
        isUploading,
        hasLibrarySnapshot,
        hasItems,
        categoryCounts,
        totalSize,
        filteredMediaItems,
        hasFilteredItems,
    };
}
