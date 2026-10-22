/**
 * Types of the composables of the publish domain.
 */

import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type { ComputedRef, Ref } from 'vue';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IBricksSchema } from '../../../common/types/brick';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type {
    IImageResolverState,
    TImageResolveAction,
} from '../../media/types/schemaImageResolver';
import type { IMediaUploadProgress, TMediaLightboxItem } from '../../media/types/media';
import type {
    IBricksMediaOptimization,
    IMediaItem,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';

// #region usePublishVersionRestore
/**
 * Options of `usePublishVersionRestore`.
 */
export interface IUsePublishVersionRestoreOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
}

/**
 * The page and the version waiting for the rollback to be confirmed.
 */
export interface IPendingVersionRestore {
    page: TPublishedPageSummary;
    version: IPageVersionSummary;
}

/**
 * The return value of `usePublishVersionRestore`.
 */
export interface IUsePublishVersionRestoreReturn {
    isRestoreConfirmationOpen: Ref<boolean>;
    isRestoring: Ref<boolean>;
    restoreConfirmationDescription: ComputedRef<string>;
    requestRestoreVersion: (page: TPublishedPageSummary, version: IPageVersionSummary) => void;
    closeRestoreConfirmation: (force?: boolean) => void;
    confirmRestoreVersion: () => Promise<void>;
}
// #endregion

// #region usePublishPageDelete
export interface IUsePublishPageDeleteOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
    /**
     * The page was deleted. The host has to drop the selection when the deleted one
     * was open in the details panel: the panel itself never learns about a deletion.
     */
    onDeleted: (pageId: string) => void;
}

/**
 * The return value of `usePublishPageDelete`.
 */
export interface IUsePublishPageDeleteReturn {
    isDeleteConfirmationOpen: Ref<boolean>;
    isDeleting: Ref<boolean>;
    deleteConfirmationDescription: ComputedRef<string>;
    requestDeletePage: (page: TPublishedPageSummary) => void;
    closeDeleteConfirmation: (force?: boolean) => void;
    confirmDeletePage: () => Promise<void>;
}
// #endregion

// #region usePublishMediaGallery
/**
 * The return value of `usePublishMediaGallery`.
 */
export interface IUsePublishMediaGalleryReturn {
    /** The gallery component has to be kept in the markup (the first-opening latch) */
    shouldMount: Ref<boolean>;
    isOpen: Ref<boolean>;
    open: () => void;
    close: () => void;
}
// #endregion

// #region usePublishMediaSurface
/**
 * Options of `usePublishMediaSurface`.
 */
export interface IUsePublishMediaSurfaceOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
}

/**
 * The return value of `usePublishMediaSurface`: the state of the media library
 * shared by the header of the dashboard, the body of the section and the details
 * panel of a file.
 */
export interface IUsePublishMediaSurfaceReturn {
    /**
     * The active category of the track. Lives here rather than in the section
     * because it decides the category of the files being uploaded, while the upload
     * button stands in the header of the dashboard — that is, outside the section.
     */
    categoryFilter: Ref<string>;
    /** The image size ceiling from the module config — the hint of the upload */
    maxImageSizeMb: number;
    /** The video size ceiling from the module config */
    maxVideoSizeMb: number;
    /** The optimization parameters from the config — what the popover returns to */
    defaultOptimization: IBricksMediaOptimization;
    uploadOptimization: Ref<IBricksMediaOptimization>;
    /** The progress of the current upload; `null` — no upload is running */
    uploadProgress: Ref<IMediaUploadProgress | null>;
    /** The selected file; `null` — the details panel is closed */
    selectedItemId: Ref<number | null>;
    selectedItem: ComputedRef<IMediaItem | null>;
    /** The file open full screen; `null` — the lightbox is closed */
    previewItem: Ref<IMediaItem | null>;
    /** The number of files for the rail counter; `null` — the list was never read */
    mediaCount: ComputedRef<number | null>;
    isDeleteConfirmOpen: Ref<boolean>;
    isDeleting: Ref<boolean>;
    /** Reads the file list unless a trustworthy snapshot is in already */
    ensureMedia: () => Promise<void>;
    uploadFiles: (files: File[]) => Promise<void>;
    setOptimization: (value: IBricksMediaOptimization) => void;
    selectItem: (item: IMediaItem) => void;
    closeDetails: () => void;
    openPreview: (item: IMediaItem) => void;
    closePreview: () => void;
    updateMeta: (meta: IMediaUpdateMetaRequest) => Promise<void>;
    updateCategory: (category: string | null) => Promise<void>;
    requestDelete: () => void;
    closeDeleteConfirm: () => void;
    confirmDelete: () => Promise<void>;
    /** Resets the filter, the search-independent state and the upload parameters */
    resetSurface: () => void;
}
// #endregion

// #region usePublishPageActions
export interface IUsePublishPageActionsOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
}

/**
 * The return value of `usePublishPageActions`: the actions of a row and of the
 * details panel that need no confirmation.
 */
export interface IUsePublishPageActionsReturn {
    /**
     * The identifiers of the pages being copied right now; a consumer asks about its
     * own row (`has(String(page.id))`). A set rather than one identifier: copies of
     * different pages are independent, and a shared flag would silently drop a click
     * on the button of another row.
     */
    duplicatingPageIds: Ref<Set<string>>;
    /**
     * The identifiers of the pages whose publication flag is being written. One
     * write per page: two parallel PATCHes of the flag settle by the order their
     * answers arrive in rather than by the last intention of the person, while
     * toggles of DIFFERENT pages are independent and are not held back by one
     * another.
     */
    togglingPageIds: Ref<Set<string>>;
    /** The thumbnail open in the lightbox; `null` — the lightbox is closed */
    thumbnailPreviewItem: Ref<TMediaLightboxItem | null>;
    togglePublished: (page: TPublishedPageSummary, published: boolean) => Promise<void>;
    duplicatePage: (page: TPublishedPageSummary) => Promise<void>;
    previewPage: (page: TPublishedPageSummary) => void;
    previewThumbnail: (page: TPublishedPageSummary) => void;
    closeThumbnailPreview: () => void;
}
// #endregion

// #region usePublishPageVersions
/**
 * The return value of `usePublishPageVersions`.
 */
export interface IUsePublishPageVersionsReturn {
    versions: Ref<IPageVersionSummary[]>;
    isLoading: ComputedRef<boolean>;
    loadVersions: (pageId: string | number) => Promise<void>;
    /**
     * Opens the preview of a version in a new tab. Synchronously: the server pulls
     * the snapshot by `?version=`, the client has nothing to load. `false` — the
     * tab did not open.
     */
    previewVersion: (page: TPublishedPageSummary, versionId: number) => boolean;
    /** Clears the list and devalues the request in flight (a change of page) */
    resetVersions: () => void;
}
// #endregion

// #region usePublishPagesData
/**
 * The data of the page list in the `useAsyncData('bricks-pages')` cache.
 *
 * The pages themselves are not here: the list lies in
 * `publishStore.publishedPages` — the single source for both the dashboard and the
 * builder. A second copy in the payload would part ways with it on the very first
 * local write (a creation, a deletion, a publication toggled), and on SSR it would
 * double the weight of the page on top of that: the state of the Pinia stores
 * travels to the client in the payload anyway.
 */
export interface IPublishPagesData {
    /**
     * The SSR run degraded: the list is not loaded, and the client is obliged to
     * load it. The field is mandatory rather than optional so that a branch which
     * forgot to set it does not pass an empty list off as a loaded one.
     *
     * A refusal on the client is not encoded by a marker — it lives in the `error`
     * of the same `useAsyncData`: there the caller can see it, and a retry is
     * possible right away.
     */
    isPartial: boolean;
}

/**
 * Options of `usePublishPagesData`.
 */
export interface IUsePublishPagesDataOptions {
    /** Reports a refused load on the client (a toast of the dashboard) */
    onLoadFailed: () => void;
}

/**
 * The return value of `usePublishPagesData`.
 */
export interface IUsePublishPagesDataReturn {
    isLoadingPages: ComputedRef<boolean>;
    /**
     * A re-read requested by a person is running. Apart from `isLoadingPages`: the
     * list on screen stays on screen and keeps its rows, and only the control that
     * started the request reports the waiting — replacing the rows with the initial
     * spinner would take the list away from someone who merely asked whether
     * anything had changed.
     */
    isRefreshingPages: Ref<boolean>;
    /** Re-reads the list on request; a repeat while one is in flight does nothing */
    refreshPages: () => Promise<void>;
}
// #endregion

// #region usePublishDetailsUrl
/**
 * The reactive fields of the details panel form that take part in the live URL.
 */
export interface IPublishDetailsUrlFields {
    pagename: Ref<string>;
    urlPrefix: Ref<string>;
    subdomain: Ref<string>;
}

/**
 * The return value of `usePublishDetailsUrl`.
 */
export interface IPublishDetailsUrlReturn {
    liveUrl: ComputedRef<string>;
    copyLiveUrl: () => Promise<boolean>;
}
// #endregion

// #region useSchemaFileTransfer
/**
 * A parsed and validated JSON schema file together with the metadata of the pick.
 *
 * The metadata lies next to the schema as one object rather than as separate refs:
 * the replacement confirmation prints the name of the file, while the pick row in
 * the creation modal prints the name and the number of blocks. Storing them apart
 * would let them part ways on a second pick of a file (a new schema, the previous
 * name).
 */
export interface IParsedSchemaFile {
    schema: IBricksSchema;
    filename: string;
    /** The number of root blocks of the schema — what the picked file row shows */
    blocksCount: number;
    /**
     * Where the file came from: an `envelope` carries a device set, `legacy` is a
     * bare schema out of the files written before the set appeared.
     *
     * Telling them apart is mandatory: a legacy file has no set, and substituting
     * any set for it means changing the layout of the target page unasked.
     */
    kind: 'envelope' | 'legacy';
    /**
     * The device set out of the file. Three states, and the third one is mandatory:
     *
     * - a set — the file describes steps of its own;
     * - `null` — the file says outright "the page inherits the set of the project";
     * - `undefined` — the file says **nothing** about a set: a legacy schema, or an
     *   envelope the field is absent from. The target page keeps its own set.
     *
     * Without the third state an envelope with no such field would read as an
     * explicit `null` and would silently strip the page being imported into of its
     * own set.
     */
    viewportConfig?: TBricksPageDeviceSet | null;
}

/**
 * The format of a page transfer file.
 *
 * The version is inside the file rather than in its name: a bare schema (the files
 * from before the device set appeared) is still accepted, and telling it from an
 * envelope has to happen by the content.
 */
export interface IBricksPageTransferFile {
    version: 1;
    schema: IBricksSchema;
    viewportConfig: TBricksPageDeviceSet | null;
}

/**
 * An envelope after somebody else's file has been parsed.
 *
 * It differs from the written format in one thing: the `viewportConfig` field may
 * be absent from the file altogether. The package always writes its own files with
 * it, but what has to be parsed also includes what somebody else assembled.
 */
export interface IParsedEnvelope extends Omit<IBricksPageTransferFile, 'viewportConfig'> {
    viewportConfig?: TBricksPageDeviceSet | null;
}

/**
 * The outcome of reading the picked file. A union rather than a callback: the two
 * consumers have different life cycles — the details panel applies the schema at
 * once, the creation modal holds the file until the submit — and a shared
 * `onImport` would impose one life cycle on both.
 */
export type TSchemaFileReadResult =
    | { status: 'success'; file: IParsedSchemaFile }
    | { status: 'error'; message: string };

/**
 * The minimal shape of a file input the reading needs: the picked files and a
 * resettable value. `HTMLInputElement` matches it structurally.
 *
 * The reading takes this shape rather than an `Event`: an event would bring a
 * target that has to be cast anyway — and the composable owns the ref of the input
 * already. As a bonus, the reading is testable without a DOM.
 */
export interface ISchemaFileInput {
    files: FileList | File[] | null;
    value: string;
}

/**
 * The return value of `useSchemaFileTransfer`.
 */
export interface IUseSchemaFileTransferReturn {
    fileInputRef: Ref<HTMLInputElement | null>;
    openFilePicker: () => void;
    /**
     * Reads the picked file; `null` — there was no file (the dialog was canceled).
     * The `value` of the input is reset on every outcome, otherwise picking the
     * same file again would raise no `change`.
     */
    readSelectedFile: (input: ISchemaFileInput | null) => Promise<TSchemaFileReadResult | null>;
    /**
     * Downloads the page as an envelope: the schema together with the device set.
     * Without the set the round trip would lose the description of the ranges, and
     * an imported page would show `props.responsive` of steps it does not have.
     */
    downloadSchema: (
        schema: IBricksSchema,
        filename: string,
        viewportConfig: TBricksPageDeviceSet | null
    ) => void;
}
// #endregion

// #region usePublishSchemaImport
/**
 * The target of an import into an existing page, taken at the moment the file was
 * picked.
 *
 * A snapshot rather than a reference to the selected page: between the pick of the
 * file and the PATCH stand the reading of the file, the confirmation and the image
 * resolver, and in that window a person has time to select another page in the
 * list. `expectedRevision` comes from the moment of the pick as well — the
 * confirmation concerns the state the person saw, not the one that managed to
 * arrive afterwards.
 */
export interface IPublishSchemaImportTarget {
    pageId: string | number;
    expectedRevision: number;
    title: string;
}

/**
 * Options of `usePublishSchemaImport`.
 */
export interface IUsePublishSchemaImportOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
    /**
     * Whether the target is still current: the id is still selected in the list
     * (the details panel is open).
     *
     * Optional: the check belongs to the host that owns the page list. Where there
     * is no list (creating a page from the editor) an import into an existing page
     * is unavailable, so there is nothing to check against.
     */
    isTargetSelected?: (pageId: string | number) => boolean;
}

/**
 * The return value of `usePublishSchemaImport`.
 */
export interface IUsePublishSchemaImportReturn {
    isResolverModalOpen: Ref<boolean>;
    /** The resolver modal has been opened — from then on its chunk stays mounted */
    shouldMountResolver: Ref<boolean>;
    resolverState: IImageResolverState;
    isReplaceConfirmationOpen: Ref<boolean>;
    replaceConfirmationDescription: ComputedRef<string>;
    isImporting: Ref<boolean>;
    requestPageImport: (page: TPublishedPageSummary, file: IParsedSchemaFile) => void;
    closeReplaceConfirmation: () => void;
    confirmReplace: () => void;
    /** Starts the resolver once the confirmation dialog has left the DOM */
    handleConfirmationAfterLeave: () => Promise<void>;
    /**
     * Runs a schema through the image resolver for the creation of a page.
     * `null` — the import was canceled or displaced; the caller creates no page.
     */
    resolveSchemaForCreate: (schema: IBricksSchema) => Promise<IBricksSchema | null>;
    /**
     * Puts the operation out: a change of the selected page, the panel closing, an
     * unmount.
     */
    cancelImport: () => void;
    handleResolverConfirm: () => void;
    handleResolverCancel: () => void;
    handleResolverSkip: () => void;
    handleSetImageAction: (url: string, action: TImageResolveAction) => void;
    handleSetGlobalAction: (action: TImageResolveAction) => void;
}
// #endregion

// #region usePublishPreview
/**
 * The return value of `usePublishPreview`.
 */
export interface IUsePublishPreviewReturn {
    previewCurrentPage: (schema: IBricksSchema) => IBricksPageAddress | null;
    /** The preview of a saved version: `?version=` in the preview route, no storage */
    previewPageVersion: (
        address: IBricksPageAddress,
        versionId: number
    ) => IBricksPageAddress | null;
    /**
     * Opens the preview route in a new tab; `false` — the tab did not open (a popup
     * blocker or no `window`). What to show on a refusal is decided by the caller.
     */
    openPreviewTab: (address: IBricksPageAddress, versionId?: number) => boolean;
}
// #endregion
