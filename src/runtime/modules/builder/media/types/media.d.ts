/**
 * Media gallery UI types.
 * The contract data types (`IMediaItem`, the API responses, `TMediaGalleryContext`)
 * live in `common/types/media.d.ts`; the server-side processing types live in
 * `persistence/types/media.d.ts`.
 */

import type { ComputedRef, Ref } from 'vue';
import type {
    IBricksMediaOptimization,
    IMediaCategory,
    IMediaItem,
    IMediaUpdateMetaRequest,
    TMediaGalleryContext,
} from '../../../common/types/media';

export interface IMediaGalleryProps {
    visible: boolean;
    context?: TMediaGalleryContext;
}

/**
 * The field of an item a write owns. The number of a write is kept per field rather
 * than per item: edits of different fields of one file travel as different PATCHes
 * and do not contradict one another — a shared counter would mute the answer of a
 * neighboring edit.
 */
export type TMediaItemWriteField = 'filename' | 'alt' | 'category';

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

export interface IMediaGalleryEmits {
    close: [];
    select: [item: IMediaItem];
    error: [message: string];
}

/**
 * Progress of uploading a set of files. Counted in files rather than in bytes: the
 * sending is one `$fetch` per file, and that one has no byte progress.
 */
export interface IMediaUploadProgress {
    /** The number of the file being uploaded right now (1-based) */
    current: number;
    total: number;
    filename: string;
}

export interface IMediaUploadOptions {
    /** Returns the category for the files being uploaded; null — no category */
    resolveCategory: () => string | null;
    /** Returns the optimization parameters of the upload */
    resolveOptimization: () => IBricksMediaOptimization;
    /** Callback for the validation errors (the size limit is exceeded) */
    onError: (message: string) => void;
}

export interface IMediaGalleryFiltersProps {
    categoryFilter: string;
    categories: IMediaCategory[];
    /** How many files each category holds, by slug — the counter of a tab */
    categoryCounts: Record<string, number>;
    /**
     * How many files the media library holds in total — the counter of the "All"
     * tab; `null` — the contents have not been read yet, and the counter is not
     * drawn at all: a zero in its place would claim that there are no files.
     */
    totalCount: number | null;
    /** A category is being created — the input field is in its waiting state */
    isCreatingCategory: boolean;
}

export interface IMediaGalleryFiltersEmits {
    'update:categoryFilter': [value: string];
    'create-category': [label: string];
    'delete-category': [slug: string];
}

export interface IMediaGalleryCategoryTabsProps {
    modelValue: string;
    categories: IMediaCategory[];
    categoryCounts: Record<string, number>;
    /** `null` — the contents have not been read yet, the "All" counter is hidden */
    totalCount: number | null;
    /** The managing mode: the categories show their delete crosses */
    isManaging: boolean;
}

export interface IMediaGalleryCategoryTabsEmits {
    'update:modelValue': [value: string];
    'delete-category': [slug: string];
}

export interface IMediaGalleryUploadControlsProps {
    maxImageSizeMb: number;
    maxVideoSizeMb: number;
    optimization: IBricksMediaOptimization;
    /**
     * The width out of the config — the bounds of the field are counted from it, see
     * the prop of the same name on the popover.
     */
    configuredMaxWidth: number;
    /** Progress of the current upload; null — nothing is being uploaded */
    uploadProgress: IMediaUploadProgress | null;
    /**
     * Whether to show the parameters cog next to the button. In the dashboard
     * section the cog stands in the row of filters — next to the track of
     * categories, that is, next to what the category of the uploaded files depends
     * on — and in the header it would be a second one.
     */
    showOptions?: boolean;
    /**
     * The hint about where a file may be dropped. Unset — "right into the window",
     * as in the modal; the dashboard section passes its own: the target there is
     * bounded by the body of the section, and neither the header nor the rail takes
     * a file.
     */
    dropHint?: string;
}

export interface IMediaGalleryUploadControlsEmits {
    upload: [files: File[]];
    'update:optimization': [value: IBricksMediaOptimization];
}

/**
 * The overlay of the drop target, unfolding over the grid while files are being
 * dragged. There is no permanent upload zone — the entry point lives in the header
 * and as the first cell of the grid, and the target shows up exactly when the files
 * are already over the window.
 */
export interface IMediaGalleryDropOverlayProps {
    /** How many files are being dragged — out of `dataTransfer.items` */
    fileCount: number;
    maxImageSizeMb: number;
    maxVideoSizeMb: number;
    optimization: IBricksMediaOptimization;
}

/**
 * The optimization parameters cog with its popover. The side of the tooltip is a
 * prop: in the header of the modal the tooltip goes down, in the filters row of the
 * section it goes up so as not to cover the grid.
 */
export interface IMediaGalleryUploadOptionsPopoverProps {
    optimization: IBricksMediaOptimization;
    /**
     * The width out of the config — the bounds of the field are counted from it, see
     * the parameters panel.
     */
    configuredMaxWidth: number;
    tooltipSide?: 'top' | 'bottom';
}

export interface IMediaGalleryUploadOptionsPopoverEmits {
    'update:optimization': [value: IBricksMediaOptimization];
}

export interface IMediaGalleryUploadOptionsProps {
    optimization: IBricksMediaOptimization;
    /**
     * The width out of the module's config. A prop of its own rather than a field of
     * `optimization`: the bounds of the field have to be counted from a value that
     * does not move, otherwise the number the user typed would raise its own ceiling.
     */
    configuredMaxWidth: number;
}

export interface IMediaGalleryUploadOptionsEmits {
    'update:optimization': [value: IBricksMediaOptimization];
}

export interface IMediaGalleryGridProps {
    items: IMediaItem[];
    selectedItemId: number | null;
    /** Show a skeleton tile as the first item (an upload is running) */
    showSkeleton: boolean;
    /** Show the upload target tile as the first cell */
    showUploadTile: boolean;
}

export interface IMediaGalleryGridEmits {
    select: [item: IMediaItem];
    preview: [item: IMediaItem];
    upload: [];
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
 * The body of the "Media" section of the dashboard: the track of categories, the
 * grid and the drop target.
 *
 * The category, the selected file and the upload parameters arrive as props rather
 * than living inside: the upload button stands in the header of the dashboard and
 * the details panel in a slot of the shell, that is, both of them outside the
 * section. What is left to the section is what is entirely its own: managing the
 * categories, filtering the list and the dragging of files.
 */
export interface IMediaSectionProps {
    /** The search string out of the dashboard header */
    searchQuery: string;
    /** The active category of the track */
    categoryFilter: string;
    /** The selected file — a highlighted tile; `null` — nothing is selected */
    selectedItemId: number | null;
    maxImageSizeMb: number;
    maxVideoSizeMb: number;
    /**
     * The upload parameters: the overlay of the target shows them and the popover of
     * the row edits them.
     */
    uploadOptimization: IBricksMediaOptimization;
    /**
     * The width out of the config — the bounds of the field in the upload parameters
     * are counted from it.
     */
    configuredMaxWidth: number;
}

export interface IMediaSectionEmits {
    'update:categoryFilter': [value: string];
    'update:uploadOptimization': [value: IBricksMediaOptimization];
    select: [item: IMediaItem];
    preview: [item: IMediaItem];
    upload: [files: File[]];
    /**
     * The target tile asks for the system file picker: the input itself lives in the
     * controls of the header, and a second one just like it would mean two points of
     * truth about which file types are accepted.
     */
    'request-upload': [];
    /** An empty result: drop the category and the search string in one go */
    'reset-filters': [];
    notify: [message: string, variant: 'success' | 'error'];
}

/**
 * The details panel of a file in the "Media" section.
 *
 * The same container as the details panel of a page has, and the same controls as
 * the meta panel of the modal. The horizontal bar of the modal does not travel into
 * the section: no other part of the dashboard has such a bar, and the section would
 * read as a modal built into the page.
 */
export interface IMediaSectionDetailsPanelProps {
    item: IMediaItem;
    categories: IMediaCategory[];
}

export interface IMediaSectionDetailsPanelEmits {
    close: [];
    'update-meta': [meta: IMediaUpdateMetaRequest];
    'update-category': [category: string | null];
    remove: [];
    /** "Open full screen": the dashboard has one lightbox, and it lives in the host */
    preview: [];
    notify: [message: string, variant: 'success' | 'error'];
}

export interface IMediaGalleryMetaPanelProps {
    selectedItem: IMediaItem | null;
    categories: IMediaCategory[];
    /** Whether to show the "Cancel" / "Pick" buttons (the picking context) */
    showPickerActions: boolean;
}

export interface IMediaGalleryMetaPanelEmits {
    'update-meta': [meta: IMediaUpdateMetaRequest];
    'update-category': [category: string | null];
    remove: [];
    close: [];
    insert: [];
}

/**
 * The least a full-screen lightbox needs — which lets it be reused outside the
 * gallery (the page preview of the publish dashboard, for one).
 */
export type TMediaLightboxItem = Pick<IMediaItem, 'url' | 'mimeType'> &
    Partial<Pick<IMediaItem, 'alt' | 'filename'>>;

export interface IMediaGalleryPreviewLightboxProps {
    item: TMediaLightboxItem | null;
}

export interface IMediaGalleryPreviewLightboxEmits {
    close: [];
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
