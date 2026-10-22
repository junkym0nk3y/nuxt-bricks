/**
 * Contracts of the builder session and of everything that hangs off it: the
 * address, the snapshot, the drafts, the feedback of its state and the chrome of
 * the page it lives on.
 *
 * A file of its own rather than a second half of `composables.d.ts`: the session is
 * one cluster wired by six composables and by the test harness, and together the two
 * groups crossed the file ceiling. The split is by that cluster and by nothing else —
 * a contract belongs here when it is wired INTO the session (it takes the session
 * apart, dresses the page the session lives on, or reports its state), and in
 * `composables.d.ts` otherwise, so a new composable has one place to go rather than
 * a choice.
 */

import type { ComputedRef, Ref } from 'vue';

import type { IPublishedPage } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type {
    IBuilderDraftSnapshot,
    TBuilderDraftPrincipal,
} from '../../publish/types/builderDrafts';
import type { IDraftStorageNotice } from './draftStorage';
import type { TShowToast } from '../../core/types/toast';

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
 * `useBuilderSessionSnapshot.switchToSavedPage`; the toast and the thumbnail after the
 * resolve are the caller's job (`useBuilderPageWrite.handleSaveAsCopy`).
 */
export type TSwitchToSavedPage = (page: IPublishedPage) => Promise<void>;

/**
 * Options of the useBuilderSessionAddress composable.
 */
export interface IBuilderSessionAddressOptions {
    draftStorageNotice: IDraftStorageNotice;
    /**
     * The owner of the drafts of this session (`resolveBuilderDraftPrincipal`).
     * `null` — the identity is unknown, and then drafts are neither read nor
     * written: a shared key would merge the users back together.
     *
     * It is computed once by the composition root and handed to every consumer of
     * the drafts as one and the same value: written under one principal and removed
     * under another, a draft would come back to life on the next visit.
     */
    draftPrincipal: TBuilderDraftPrincipal | null;
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
 * by `useBuilderSessionSnapshot.commitSavedSnapshot`; called explicitly from both writing
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
     * The key of a draft carries the principal, so the drafts of two accounts no
     * longer meet; the editing right is the second half of the same barrier, and it
     * is about a role rather than an identity. Without it a draft is not read at
     * all: an observer sharing the account of an editor would otherwise see their
     * unfinished work and, by answering "discard" in the restore window, would take
     * it away for good. It comes from the composition root rather than from the
     * permissions composable directly: that is how a test substitutes it.
     */
    canEdit: ComputedRef<boolean>;
    /**
     * The owner of the drafts of this session (`resolveBuilderDraftPrincipal`).
     * `null` — the identity is unknown, and then drafts are neither read nor
     * written: a shared key would merge the users back together.
     *
     * It is computed once by the composition root and handed to every consumer of
     * the drafts as one and the same value: written under one principal and removed
     * under another, a draft would come back to life on the next visit.
     */
    draftPrincipal: TBuilderDraftPrincipal | null;
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
    /**
     * The owner of the drafts of this session (`resolveBuilderDraftPrincipal`).
     * `null` — the identity is unknown, and then drafts are neither read nor
     * written: a shared key would merge the users back together.
     *
     * It is computed once by the composition root and handed to every consumer of
     * the drafts as one and the same value: written under one principal and removed
     * under another, a draft would come back to life on the next visit.
     */
    draftPrincipal: TBuilderDraftPrincipal | null;
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

// #region useBuilderSessionSnapshot
/**
 * Options of the useBuilderSessionSnapshot composable: everything the snapshot of a
 * session is written and swept up by. The generation is only READ here — raising it
 * stays with `useBuilderSession`, which owns the openings.
 */
export interface IBuilderSessionSnapshotOptions {
    sessionAddress: Ref<IBricksPageAddress>;
    renameSession: TRenameBuilderSession;
    sessionToken: IBuilderSessionToken;
    draftStorageNotice: IDraftStorageNotice;
    draftPrincipal: TBuilderDraftPrincipal | null;
}

/**
 * Return value of the useBuilderSessionSnapshot composable.
 */
export interface IUseBuilderSessionSnapshotReturn {
    savedSnapshot: Ref<IBuilderDraftSnapshot | null>;
    /**
     * The identity of the open page: the id of a saved one, or null for a new one.
     * It travels with the snapshot rather than with the session because the commit
     * is the single point where both are written together.
     */
    sessionPageId: Ref<string | number | null>;
    buildCurrentSnapshot: () => IBuilderDraftSnapshot;
    applySnapshot: (snapshot: IBuilderDraftSnapshot) => void;
    discardDraft: (address: IBricksPageAddress) => void;
    commitSavedSnapshot: TCommitSavedSnapshot;
    switchToSavedPage: TSwitchToSavedPage;
}
// #endregion

// #region useBuilderSessionFeedback
/**
 * Options of the useBuilderSessionFeedback composable: the state of the session it
 * answers for, and the two ways out of the offer to restore a draft.
 */
export interface IBuilderSessionFeedbackOptions {
    isSessionLoading: Ref<boolean>;
    isSessionReady: Ref<boolean>;
    sessionError: Ref<string | null>;
    isDraftRestorePending: Ref<boolean> | ComputedRef<boolean>;
    isRestoreDraftModalOpen: Ref<boolean>;
    /** The action button of the toast: restores the draft without the window */
    handleRestoreDraft: () => void;
    /** A click on the body of the toast: the window with the date and the removal */
    openRestoreDraftModal: () => void;
}

/**
 * Return value of the useBuilderSessionFeedback composable.
 */
export interface IUseBuilderSessionFeedbackReturn {
    /** The whole interface is closed: a load or a refused bootstrap */
    isBuilderLocked: ComputedRef<boolean>;
    /** Only the workspace is closed — the toolbar of a refused session stays live */
    isWorkspaceLocked: ComputedRef<boolean>;
    /** The loader has left the screen — the moment the draft may be offered */
    handleLoaderHidden: () => void;
}
// #endregion

// #region useBuilderPageChrome
/**
 * Options of the useBuilderPageChrome composable. The sign-out arrives from the
 * outside: the session of the composition root is what owns it, and the chrome only
 * reports a refusal.
 */
export interface IBuilderPageChromeOptions {
    logout: () => Promise<void>;
}

/**
 * Return value of the useBuilderPageChrome composable.
 */
export interface IUseBuilderPageChromeReturn {
    isDarkMode: ComputedRef<boolean>;
    /** Passed through from the shared preferences — the editor adds nothing of its own */
    toggleDarkMode: () => void;
    toggleLocale: () => Promise<void>;
    handleLogout: () => Promise<void>;
}
// #endregion
