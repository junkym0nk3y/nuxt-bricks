/**
 * Contracts of the composables of the media library domain: what each of them takes
 * from its caller and what it hands back.
 *
 * Apart from the contracts of the components (`media.d.ts`) because the two grew
 * past the ceiling of one file, and the seam between them is the natural one: a
 * component contract is read from the markup, a composable contract from the code
 * that wires it.
 */

import type { ComputedRef, Ref } from 'vue';
import type { TBrickDemoValues } from '../../../common/types/index';
import type {
    IBricksMediaOptimization,
    IMediaCategory,
    IMediaItem,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';
import type { IBrickUiCommonProp } from '../../../ui/types/common';

/**
 * Dependencies of the file drop target of the gallery.
 */
export interface IMediaGalleryFileDropOptions {
    /** Takes the dropped files */
    onFiles: (files: File[]) => void;
    /**
     * Whether the target accepts files right now; unset — it always does. Needed
     * where the right to upload depends on the role: the overlay of the target is
     * just as much an invitation to upload a file as the button is.
     */
    isEnabled?: () => boolean;
}

/**
 * State and handlers of the file drop target of the gallery.
 */
export interface IMediaGalleryFileDrop {
    /** How many files are being dragged over the modal; 0 — there is no drag */
    draggedFileCount: Ref<number>;
    isDraggingFiles: ComputedRef<boolean>;
    handleDragOver: (event: DragEvent) => void;
    handleDragEnter: (event: DragEvent) => void;
    handleDragLeave: () => void;
    handleDrop: (event: DragEvent) => void;
    /** Collapses the target (the gallery is closing) */
    resetFileDrop: () => void;
}

export interface IMediaUploadOptions {
    /** Returns the category for the files being uploaded; null — no category */
    resolveCategory: () => string | null;
    /** Returns the optimization parameters of the upload */
    resolveOptimization: () => IBricksMediaOptimization;
    /** Callback for the validation errors (the size limit is exceeded) */
    onError: (message: string) => void;
}

/**
 * What the roving focus of the grid needs from its caller: the items it walks and
 * the file already chosen.
 *
 * Both arrive as getters rather than as refs: the grid holds them in props, and a
 * prop unwrapped once would freeze the composable on the first list it saw.
 */
export interface IMediaGalleryRovingFocusOptions {
    items: () => IMediaItem[];
    selectedItemId: () => number | null;
}

export interface IMediaGalleryRovingFocusReturn {
    /** The id of the cell holding the tab stop; null on an empty grid */
    activeItemId: Ref<string | null>;
    isActiveItem: (itemId: number) => boolean;
}

/**
 * What the drafts composable needs from its caller: the selected file and someone
 * to take the finished edit.
 *
 * The file comes as a getter rather than as a `Ref`: the meta panel gets it in a
 * prop that can be `null`, the details panel in a prop that cannot, and a shared
 * `Ref<IMediaItem | null>` would not accept the second one (a Ref is invariant).
 */
export interface IMediaMetaDraftsOptions {
    item: () => IMediaItem | null;
    onCommit: (meta: IMediaUpdateMetaRequest) => void;
}

/** Drafts of the fields of a file, and the commit of an edit when focus leaves */
export interface IMediaMetaDrafts {
    filename: Ref<string>;
    alt: Ref<string>;
    commit: () => void;
}

/**
 * What the category selector of a file needs from its caller.
 *
 * The file and the list of categories arrive as getters rather than as refs: the
 * meta panel holds them in props that can be `null`, the details panel in props
 * that cannot, and a value passed once would freeze the selector on the list it
 * first saw.
 *
 * A controller of its own rather than a field of `useMediaMetaDrafts`: the name and
 * the alt are drafts with a deferred commit, while the category is a controlled
 * select that sends the change at once.
 */
export interface IMediaCategorySelectOptions {
    item: () => IMediaItem | null;
    categories: () => IMediaCategory[];
    /** Takes the picked category; `null` — the category is taken off the file */
    onChange: (category: string | null) => void;
}

/** The options of the category selector of a file and the handler of its change */
export interface IMediaCategorySelect {
    categoryOptions: ComputedRef<IBrickUiCommonProp[]>;
    categoryFacets: ComputedRef<TBrickDemoValues[]>;
    /** The category of the file; an empty string — the file has none */
    selectedCategory: ComputedRef<string>;
    handleCategoryChange: (value: TBrickDemoValues | null) => void;
}

/**
 * A file in the upload queue together with the parameters of its own set: the
 * category and the optimization parameters are frozen at the moment of queuing,
 * otherwise a change of the filter or of the settings midway would rewrite a job
 * that had already been taken.
 */
export interface IMediaUploadQueueEntry {
    file: File;
    /** null — the file is uploaded with no category */
    category: string | null;
    optimization: IBricksMediaOptimization;
}

/**
 * What the category actions composable needs from its caller: the file counter for
 * the text of the confirmation, the reaction to a deletion (dropping a filter that
 * points at a category that is gone) and the showing of an error.
 */
export interface IMediaCategoryActionsOptions {
    resolveCategoryCount: (slug: string) => number;
    onCategoryDeleted: (slug: string) => void;
    onError: (message: string) => void;
}

/**
 * State and handlers of the row of category tabs, along with the deletion
 * confirmation.
 */
export interface IMediaCategoryActions {
    categories: ComputedRef<IMediaCategory[]>;
    isCreatingCategory: Ref<boolean>;
    categoryPendingDeletion: Ref<string | null>;
    isDeletingCategory: Ref<boolean>;
    deleteCategoryTitle: ComputedRef<string>;
    deleteCategoryDescription: ComputedRef<string>;
    handleCreateCategory: (label: string) => Promise<void>;
    handleRequestCategoryDelete: (slug: string) => void;
    handleCloseCategoryDelete: () => void;
    handleConfirmCategoryDelete: () => Promise<void>;
    resetCategoryActions: () => void;
}

/**
 * What the surface of the gallery needs from its caller: where the filter and the
 * search string are read from, how the filter is dropped, and where an error goes.
 *
 * Both of them arrive as getters rather than as values: the modal holds them in
 * refs of its own, the dashboard section in props, and a value passed once would
 * freeze the section on the filter it first saw.
 *
 * The lifecycle stays outside on purpose. The modal drops its filters, its
 * confirmations and its drop target when it closes, and handing that over here
 * would make closing the modal reach into the section of the dashboard.
 */
export interface IMediaGallerySurfaceOptions {
    categoryFilter: () => string;
    searchQuery: () => string;
    /**
     * Puts the filter back to "All" — called when the category that was deleted is
     * the one being filtered by. The search string is not the business of this
     * command: dropping a category filter and dropping the whole filter set are two
     * different actions of the surface.
     */
    onCategoryFilterReset: () => void;
    onError: (message: string) => void;
}

/**
 * The model shared by the two surfaces of the media library: the counters, the
 * filtered list and the actions over the categories.
 *
 * What is left to a surface of its own is what differs: the summary line, the
 * empty states and the lifecycle.
 */
export interface IMediaGallerySurface extends IMediaCategoryActions {
    mediaItems: ComputedRef<IMediaItem[]>;
    isUploading: ComputedRef<boolean>;
    /**
     * Whether the contents of the media library have been read: until the first
     * successful answer an empty list means "the read never got through" just as
     * much as it means "there are no files".
     */
    hasLibrarySnapshot: ComputedRef<boolean>;
    hasItems: ComputedRef<boolean>;
    /** How many files each category holds, by slug — the counter of a tab */
    categoryCounts: ComputedRef<Record<string, number>>;
    /**
     * The weight of the whole library rather than of what the filter left: the
     * summary lines of both surfaces are about the library.
     */
    totalSize: ComputedRef<number>;
    filteredMediaItems: ComputedRef<IMediaItem[]>;
    hasFilteredItems: ComputedRef<boolean>;
}
