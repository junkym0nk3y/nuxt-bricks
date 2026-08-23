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
import type { IBuilderDraftSnapshot } from '../../publish/types/builderDrafts';
import type { IBuilderToastState } from '../../core/types/toast';
import type { TCachedModal } from '../../core/types/modals';
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';
import type { ISkippedBrick } from '../../core/types/componentLibrary';
import type { IDraftStorageNotice } from './draftStorage';
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplateSaveSource } from '../../templates/types/templates';

/**
 * The function showing a toast notification of the builder.
 */
export type TShowToast = (
    message: string,
    variant?: IBuilderToastState['variant'],
    duration?: number
) => void;

// #region useBuilderSessionAddress / useBuilderSession / useBuilderDraftPersistence
/**
 * Moves the open builder session onto a new address (`urlPrefix + pagename`):
 * migration of the localStorage draft plus synchronization of the URL through Vue
 * Router.
 */
export type TRenameBuilderSession = (next: IBricksPageAddress) => Promise<void>;

/**
 * The single move of a session onto a saved page (Save as Copy): the store into
 * edit mode → renameSession (route + sessionAddress + migration of the draft) →
 * the commit of savedSnapshot. Implemented by
 * `useBuilderSession.switchToSavedPage`; the toast and the thumbnail after the
 * resolve are the caller's job (`useBuilderPageWrite.handleSaveAsCopy`).
 */
export type TSwitchToSavedPage = (page: IPublishedPage) => Promise<void>;

/**
 * Options of the useBuilderSessionAddress composable.
 */
export interface IBuilderSessionAddressOptions {
    draftStorageNotice: IDraftStorageNotice;
}

/**
 * Return value of the useBuilderSessionAddress composable.
 */
export interface IUseBuilderSessionAddressReturn {
    routeAddress: ComputedRef<IBricksPageAddress>;
    sessionAddress: Ref<IBricksPageAddress>;
    renameSession: TRenameBuilderSession;
}

/**
 * The token of a builder session: taken by an operation at its start and checked
 * before its result and its side effects are applied. Implemented by
 * `useBuilderSessionToken`; the increments belong to `useBuilderSession` alone.
 */
export interface IBuilderSessionToken {
    /** The current value — for the watchers resetting surfaces that outlive a session. */
    token: ComputedRef<number>;
    /** Takes the token at the start of an operation. */
    capture: () => number;
    /** Whether the session an operation started in is still the current one. */
    isCurrent: (captured: number) => boolean;
    /** Puts out every started operation: a new session opening, the dispose of the instance. */
    invalidate: () => void;
}

/**
 * Commits the current state of the session as the saved one: a new
 * `savedSnapshot` and the removal of the draft under the current key. Implemented
 * by `useBuilderSession.commitSavedSnapshot`; called explicitly from both writing
 * paths (the ordinary save and the move onto a copy). It takes the session token
 * captured at the start of the save and checks it itself — between the caller's
 * own check and the commit stands `await renameSession`.
 */
export type TCommitSavedSnapshot = (capturedToken: number) => void;

/**
 * Options of the useBuilderSession composable.
 */
export interface IBuilderSessionOptions {
    routeAddress: ComputedRef<IBricksPageAddress>;
    sessionAddress: Ref<IBricksPageAddress>;
    showToast: TShowToast;
    renameSession: TRenameBuilderSession;
    sessionToken: IBuilderSessionToken;
    /**
     * The message about an unreachable draft storage. The session removes a draft
     * in three places (a stale record, the commit of a saved state, a refusal to
     * restore), and a silent refusal of the removal would bring back the offer to
     * restore what has already been turned down.
     */
    draftStorageNotice: IDraftStorageNotice;
    /**
     * The editing right of the current role: whether a draft is read at all
     * depends on it.
     *
     * The key of a draft is the address — one for everyone who opens this page in
     * this browser — so a role without the editing right does not read it at all:
     * otherwise an observer would see the unfinished work of an editor and, by
     * answering "discard" in the restore window, would take it away for good. It
     * comes from the composition root rather than from the permissions composable
     * directly: that is how a test substitutes it.
     */
    canEdit: ComputedRef<boolean>;
}

/**
 * Options of the useBuilderDraftPrompt composable: the offer to restore a draft
 * lives on top of an open session, so everything tying it to that session comes
 * from the outside — the offer holds no session state of its own.
 */
export interface IBuilderDraftPromptOptions {
    /** The generation check of an opening: cuts off an answer to the offer of a former session. */
    isCurrentSession: (generation: number) => boolean;
    /** Applies the snapshot of a draft into the builder stores. */
    applySnapshot: (snapshot: IBuilderDraftSnapshot) => void;
    /** Removes a draft, reporting an unreachable storage. */
    discardDraft: (address: IBricksPageAddress) => void;
    /** The session address — the fallback removal key when the draft itself carries none. */
    sessionAddress: Ref<IBricksPageAddress>;
    /**
     * The saved version of the open page — the reference an edit made by a person
     * is told apart from a housekeeping rewrite of the form by.
     */
    savedSnapshot: Ref<IBuilderDraftSnapshot | null>;
}

/**
 * Options of the useBuilderDraftPersistence composable.
 */
export interface IBuilderDraftPersistenceOptions {
    routeAddress: ComputedRef<IBricksPageAddress>;
    sessionAddress: Ref<IBricksPageAddress>;
    isSessionLoading: Ref<boolean>;
    isSessionReady: Ref<boolean>;
    /**
     * A draft is found and unanswered. What it forbids the autosave is the REMOVAL
     * of the record, not the write: what is on the canvas is the saved version, so
     * the "matches `savedSnapshot`" branch would sweep the offered snapshot away
     * before a person had answered. The write goes on unconditionally — why, at the
     * flush of `useBuilderDraftPersistence`.
     */
    isDraftRestorePending: Ref<boolean>;
    savedSnapshot: Ref<IBuilderDraftSnapshot | null>;
    buildCurrentSnapshot: () => IBuilderDraftSnapshot;
    /**
     * The message about an unreachable storage: the probe on entering a session
     * and a refused write during the work both lead into the same one. The latch
     * is inside the notice itself — the autosave retries about every 800 ms, and a
     * message per attempt would be noise.
     */
    draftStorageNotice: IDraftStorageNotice;
    /**
     * The editing right of the current role: without it the autosave neither
     * writes the record nor removes it. The key of a draft is the address, so a
     * write by an observer would overwrite the unfinished work of an editor, and a
     * removal (the "matches the saved version" branch) would take it away for good.
     */
    canEdit: ComputedRef<boolean>;
}

/**
 * Options of the useBuilderSessionAddressSync composable.
 */
export interface IBuilderSessionAddressSyncOptions {
    renameSession: TRenameBuilderSession;
    isSessionReady: Ref<boolean>;
}
// #endregion

// #region useComponentLibrary
/**
 * The data of the component library in the `useAsyncData('bricks-components')`
 * cache: the manifest entries and the hash the endpoint's answer arrived with. The
 * hash lies next to the entries so that there is something to compare against — a
 * groundwork for comparing hashes in dev, the field has no consumer yet.
 *
 * The metadata and the hash describe one and the same answer: both arrive in the
 * manifest the generator assembles by parsing the brick files at build time.
 */
export interface IComponentLibraryData {
    /** The hash of the brick component manifest, out of the components endpoint answer. */
    hash: string;
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
    ensurePublishSettingsVisible: (message: string) => void;
}

/**
 * Return value of the useBuilderPageWrite composable.
 */
export interface IUseBuilderPageWriteReturn {
    isEditingExistingPage: ComputedRef<boolean>;
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
    isEditingExistingPage: ComputedRef<boolean>;
    hasSelectedComponent: ComputedRef<boolean>;
    leftSidebarOffset: ComputedRef<string>;
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
