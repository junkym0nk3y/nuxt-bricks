/**
 * Types of the composables.
 */

import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { ComputedRef, Ref } from 'vue';
import type { useSidebarStore } from '../../core/stores/sidebar';
import type { usePublishStore } from '../../publish/stores/publish';
import type { IMediaItem, TMediaGalleryContext } from '../../../common/types/media';
import type { IPublishedPage, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IUsePublishSchemaImportReturn } from '../../publish/types/composables';
import type { ISidebarExpose } from './builder';
import type {
    IBuilderDraftSnapshot,
    TBuilderDraftPrincipal,
} from '../../publish/types/builderDrafts';
import type { TCachedModal } from '../../core/types/modals';
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';
import type { ISkippedBrick } from '../../core/types/componentLibrary';
import type { IDraftStorageNotice } from './draftStorage';
import type { IBuilderToastState, TShowToast } from '../../core/types/toast';
import type {
    IBuilderSessionToken,
    TCommitSavedSnapshot,
    TRenameBuilderSession,
    TSwitchToSavedPage,
} from './session';
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplateSaveSource } from '../../templates/types/templates';

// #region useComponentLibrary
/**
 * The data of the component library in the `useAsyncData('bricks-components')`
 * cache: the manifest entries the endpoint's answer arrived with, metadata
 * included — the generator parses it out of the brick files at build time.
 */
export interface IComponentLibraryData {
    /**
     * The run degraded: the manifest did not arrive within the SSR deadline, there
     * are no entries and the library is left with the layout blocks alone. The
     * field is required rather than optional so that a branch which forgot to set
     * it cannot pass an incomplete result off as a complete one.
     *
     * The meaning is narrow: "the endpoint's answer missed the deadline, therefore
     * the list is degraded". An ordinary refusal of the endpoint is not encoded by
     * the marker — it lives in the `error` of the same `useAsyncData` (the
     * client-side recovery retries both outcomes but tells them apart by their
     * source). An entry with no loader in the build does not reach here at all: the
     * list after one is as full as it can be, and a retry will not mend such a
     * skip.
     */
    isPartial: boolean;
    /**
     * The manifest entries as they are. What is stored is the endpoint's answer
     * rather than the list built out of it: the library cards, the modal options,
     * the skips and the metadata index are all derived from the same entries, and
     * two copies of one answer would sooner or later drift apart. On hydration the
     * handler does not run — the entries arrive in the payload and restore
     * everything listed.
     */
    bricks: IBrickManifestEntry[];
}

/**
 * Return value of the useComponentLibrary composable.
 */
export interface IUseComponentLibraryReturn {
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
    /**
     * The manifest entries that never made it into the library. The list on the
     * screen does not give them away: otherwise a person sees a library quietly
     * short of some of its components, with no sign of a refusal at all.
     */
    skippedBricks: ComputedRef<ISkippedBrick[]>;
    /**
     * A refused load of the manifest. Apart from an empty list: the layout blocks
     * stay available under a refusal too, so a refusal cannot be told by what the
     * list holds.
     */
    isComponentLibraryLoadFailed: ComputedRef<boolean>;
    isComponentLibraryLoading: ComputedRef<boolean>;
    /** Retries the load; returns whether it succeeded. */
    refreshComponentLibrary: () => Promise<boolean>;
}
// #endregion

// #region usePageThumbnail
/**
 * The answer of POST /api/bricks/media/s3-page-thumbnail.
 */
export interface IThumbnailUploadResponse {
    success: boolean;
    url: string;
}

/**
 * Return value of the usePageThumbnail composable.
 */
export interface IUsePageThumbnailReturn {
    captureAndUploadThumbnail: (pageId: string | number, startedIn: number) => Promise<void>;
}
// #endregion

// #region useBuilderPageWrite
/**
 * Options of the useBuilderPageWrite composable: everything that belongs to the
 * composition root rather than to the write itself — the session token, the move
 * and the commit of the session, the opening of the publish panel to light the
 * fields up.
 */
export interface IBuilderPageWriteOptions {
    sessionToken: IBuilderSessionToken;
    renameSession: TRenameBuilderSession;
    switchToSavedPage: TSwitchToSavedPage;
    commitSavedSnapshot: TCommitSavedSnapshot;
    ensurePublishSettingsVisible: () => void;
}

/**
 * Return value of the useBuilderPageWrite composable.
 */
export interface IUseBuilderPageWriteReturn {
    currentPublishPageTitle: ComputedRef<string>;
    handleSaveDraft: () => Promise<void>;
    handleSaveAsCopy: () => Promise<void>;
}
// #endregion

// #region useBuilderPage
/**
 * The bridge of the inline editor (editor → the media gallery and the reset of a
 * session). Assembled by the composition root out of the editor store so that the
 * core of the builder does not import the editor.
 */
export interface IInlineMediaBridge {
    isRequestingMedia: ComputedRef<boolean>;
    resolveMediaRequest: (item: IMediaItem) => void;
    cancelMediaRequest: () => void;
    /**
     * Puts inline editing out. Its state outlives a change of the canvas schema:
     * `loadSchema` resets `selectedComponent` alone, while `componentId` and the
     * editor instance stay behind from a component the new canvas no longer holds.
     */
    cancelInlineEditing: () => void;
}

/**
 * Options of the useBuilderPage composable.
 */
export interface IBuilderPageOptions {
    inlineMediaBridge: IInlineMediaBridge;
    renameSession: TRenameBuilderSession;
    switchToSavedPage: TSwitchToSavedPage;
    commitSavedSnapshot: TCommitSavedSnapshot;
    sessionToken: IBuilderSessionToken;
    /**
     * The session is open to a consistent state. Read by the preview: before
     * readiness the canvas holds either nothing or the remains of the previous
     * page, and the preview would be built out of those.
     */
    isSessionReady: Ref<boolean> | ComputedRef<boolean>;
}

/**
 * Return value of the useBuilderPage composable.
 */
export interface IUseBuilderPageReturn {
    sidebarStore: ReturnType<typeof useSidebarStore>;
    publishStore: ReturnType<typeof usePublishStore>;
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
    /** The manifest entries that never made it into the library — for the sidebar warning. */
    skippedBricks: ComputedRef<ISkippedBrick[]>;
    isComponentLibraryLoadFailed: ComputedRef<boolean>;
    isComponentLibraryLoading: ComputedRef<boolean>;
    handleRetryComponentLibrary: () => Promise<void>;
    /**
     * Reports a refused load of the library with a toast. Called by the page out of
     * `onMounted`: the composable is awaited on SSR too, where there is nobody to
     * show it to.
     */
    notifyComponentLibraryFailure: () => void;
    isDocumentationModalOpen: Ref<boolean>;
    shouldMountMediaGallery: Ref<boolean>;
    isMediaGalleryModalOpen: Ref<boolean>;
    mediaGalleryContext: Ref<TMediaGalleryContext>;
    sidebarRef: Ref<ISidebarExpose | null>;
    propertiesPanelRef: Ref<ISidebarExpose | null>;
    toast: IBuilderToastState;
    currentPublishPageTitle: ComputedRef<string>;
    handleKeyDown: (event: KeyboardEvent) => void;
    showToast: TShowToast;
    handleToggleLibrary: () => void;
    handleToggleSchema: () => void;
    handleOpenPublishSettings: () => void;
    handleOpenDocs: () => void;
    handleCloseDocs: () => void;
    handleMediaError: (message: string) => void;
    handleOpenMediaGallery: (context?: TMediaGalleryContext) => void;
    handleCloseMediaGallery: () => void;
    handleMediaSelect: (item: IMediaItem) => void;
    handleSaveDraft: () => Promise<void>;
    handleSaveAsCopy: () => Promise<void>;
    handlePreview: () => Promise<void>;
}
// #endregion

// #region useBuilderPageSelector
/**
 * Options of the useBuilderPageSelector composable: everything the selector is
 * tied to the open session by. It holds no session state of its own.
 */
export interface IBuilderPageSelectorOptions {
    /** The identity of the open page: picking the page itself is cut off by it. */
    sessionPageId: Ref<string | number | null>;
    routeAddress: ComputedRef<IBricksPageAddress>;
    /**
     * The session token: the creation of a page outlives a move onto another
     * builder page (the modal is portaled, the page is not remounted), and moving
     * into the created page only makes sense for the session it was created in.
     */
    sessionToken: IBuilderSessionToken;
    showToast: TShowToast;
}

/**
 * Return value of the useBuilderPageSelector composable.
 */
export interface IUseBuilderPageSelectorReturn {
    /** The page list is being loaded or refreshed. */
    isPagesRefreshing: Ref<boolean>;
    /** The create window has been opened once — its chunk is mounted from then on. */
    shouldMountCreatePageModal: Ref<boolean>;
    isCreatePageModalOpen: Ref<boolean>;
    schemaImport: IUsePublishSchemaImportReturn;
    handleOpenPageSelector: () => Promise<void>;
    handleSelectPage: (page: TPublishedPageSummary) => Promise<void>;
    handleOpenCreatePage: () => void;
    handleCloseCreatePage: () => void;
    handlePageCreated: (address: IBricksPageAddress) => Promise<void>;
}
// #endregion

// #region useBuilderTemplateSave
/**
 * Options of the useBuilderTemplateSave composable.
 */
export interface IUseBuilderTemplateSaveOptions {
    /** The session is open to a consistent state: before that the canvas is empty. */
    isSessionReady: Ref<boolean> | ComputedRef<boolean>;
    showToast: TShowToast;
}

/**
 * Return value of the useBuilderTemplateSave composable.
 */
export interface IUseBuilderTemplateSaveReturn {
    /** The content of the future template and the caption of its source; `null` — none. */
    source: ComputedRef<ITemplateSaveSource | null>;
    isModalOpen: ComputedRef<boolean>;
    /** The form has been opened once — its chunk is mounted from then on. */
    shouldMountModal: ComputedRef<boolean>;
    /** Assembles the source out of the canvas and opens the template form. */
    requestFromCanvas: () => void;
    close: () => void;
    /** The template is saved: close the form and show a toast. */
    handleSaved: (template: TBricksTemplateSummary) => void;
}
// #endregion
