/**
 * Types of the harnesses of the builder specs: what a spec gets back after raising
 * a composable in an effect scope of its own.
 */

import type { Ref } from 'vue';

import type { IMediaCategory, IMediaItem } from '../../src/runtime/modules/common/types/media';
import type {
    IMediaCategoryActionsOptions,
    IMediaCategorySelect,
    IMediaGallerySurface,
} from '../../src/runtime/modules/builder/media/types/composables';

/**
 * A surface of the media library together with its inputs.
 *
 * `categoryActionsOptions` belongs to THIS surface: two surfaces live side by side
 * in the application (the modal over the dashboard section), and a spec reaching for
 * a shared last-created value would not tell one from the other.
 */
export interface IMediaGallerySurfaceHarness {
    surface: IMediaGallerySurface;
    categoryFilter: Ref<string>;
    searchQuery: Ref<string>;
    /** The state at the moment the surface asked for the category filter to be dropped */
    resetCalls: string[][];
    errors: string[];
    categoryActionsOptions: IMediaCategoryActionsOptions;
}

/** A category selector together with its inputs. */
export interface IMediaCategorySelectHarness {
    select: IMediaCategorySelect;
    item: Ref<IMediaItem | null>;
    categories: Ref<IMediaCategory[]>;
    changes: (string | null)[];
}
