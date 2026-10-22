// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderSessionOptions } from '../types/session';

// Utils
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isSamePageAddress } from '../../../common/utils/bricks/pageAddress';
import { isSnapshotEqual } from '../../publish/utils/draftSnapshots';
import { getBuilderDraft } from '../../publish/utils/draftStorage';
import { fetchPageRequest } from '../../publish/utils/publishApi';

// Vue
import { onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderDraftPrompt } from './useBuilderDraftPrompt';
import { useBuilderSessionSnapshot } from './useBuilderSessionSnapshot';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

const EMPTY_SCHEMA: IBricksSchema = {
    components: [],
};

/**
 * The waiting ceiling of the bootstrap. A hung request (one that neither answers nor
 * fails) otherwise leaves the workspace blocked for good: `catch`/`finally` are
 * unreachable, and a person sees a loader with no end and no way out. On the timeout
 * the session goes into the error state with a "Retry" button.
 */
const SESSION_BOOTSTRAP_TIMEOUT_MS = 30000;

/**
 * The builder session: opening a page by its ADDRESS (an existing one or a new
 * one) — a name does not identify a page, same-named pages under different
 * prefixes are different ones, and a lookup by name would open an arbitrary one of
 * them. Plus the discovery of a draft in localStorage and the offer to restore it.
 *
 * The watcher on routeAddress reopens the session on a navigation; a rename of the
 * session's own address causes no second bootstrap. The first opening is the
 * caller's (onMounted, see [pagename].vue).
 */
export function useBuilderSession(options: IBuilderSessionOptions) {
    const {
        routeAddress,
        sessionAddress,
        showToast,
        renameSession,
        sessionToken,
        draftStorageNotice,
        canEdit,
        draftPrincipal,
    } = options;

    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    // The saved state of the session and the identity of the page it belongs to:
    // `savedSnapshot`, the draft under the session key and `sessionPageId` are one
    // invariant, written together (see useBuilderSessionSnapshot)
    const {
        savedSnapshot,
        sessionPageId,
        buildCurrentSnapshot,
        applySnapshot,
        discardDraft,
        commitSavedSnapshot,
        switchToSavedPage,
    } = useBuilderSessionSnapshot({
        sessionAddress,
        renameSession,
        sessionToken,
        draftStorageNotice,
        draftPrincipal,
    });

    const isSessionLoading = ref(true);
    // The session has loaded through to a consistent state. A flag apart from
    // isSessionLoading: that one is lowered on a bootstrap error too, after which the
    // canvas and the form hold rubbish (the defaults or the remains of the previous
    // page), and writing that into a draft would overwrite a valid record.
    const isSessionReady = ref(false);
    // The reason of a refused bootstrap — for the blocking screen. While the value
    // stands, the session is inconsistent: there is nothing to edit, because the
    // autosave and the save turn everything down by !isSessionReady. Cleared on
    // entering the next opening, "Retry" included.
    const sessionError = ref<string | null>(null);

    // The generation of a session opening — the shared token of the builder
    // (useBuilderSessionToken): one increment per entry into openBuilderSession. The
    // route watcher calls the opening without serializing it, so on quick moves
    // A → B → C the answer of B may arrive after C. Applying it is not allowed: the
    // schema of B would land on the canvas under the key of C, and the session would
    // declare itself ready — after which the autosave and the save would go out under
    // C carrying somebody else's content.
    const isCurrentSession = sessionToken.isCurrent;

    // The offer to restore a found draft: the state, the window and three outcomes.
    // A composable of its own, because it lives on top of an open session and is
    // taken down by that session's own events (a reopening, a rename).
    const {
        isDraftRestorePending,
        isRestoreDraftModalOpen,
        pendingDraft,
        armDraftPrompt,
        resolveDraftPrompt,
        stopDraftPromptWatch,
        openRestoreDraftModal,
        handleDeferDraft,
        handleRestoreDraft,
        handleDiscardDraft,
    } = useBuilderDraftPrompt({
        isCurrentSession,
        applySnapshot,
        discardDraft,
        sessionAddress,
        savedSnapshot,
    });

    /**
     * Puts out everything the former session started: both the operations that check
     * the token (an opening, a save, a preview snapshot, the portaled modals) and the
     * unfinished writes in the store. In one point, because they are not allowed to
     * diverge: a write left in the list of the active ones would hold the indicator
     * and the ban on a second submit on a page it has nothing to do with. The
     * requests themselves keep flying meanwhile — their outcome reaches the person in
     * a toast labeled with its own page.
     */
    function abandonSessionOperations(): void {
        sessionToken.invalidate();
        publishStore.resetActiveWrites();

        // The watcher of the first edit is set outside setup (after the awaits of the
        // bootstrap), so there is no active scope at the moment of its registration
        // and it will not stop itself — it is taken down here, at the shared point
        // where a session is put out
        stopDraftPromptWatch();
    }

    // An unfinished opening outlives its page instance (the stores live at the level
    // of the application), and the increment on dispose is what puts every opening of
    // this instance out at once.
    onScopeDispose(abandonSessionOperations);

    /**
     * Brings the builder stores to the state of the page being opened: the saved
     * version or a clean canvas, plus the handling of a found draft. It throws
     * outwards — the session then stays unready and the autosave does not write its
     * state.
     *
     * Every await is checked against the generation: a displaced opening leaves
     * quietly, before any write into the stores. The page list (`ensurePagesLoaded`)
     * is the exception — it is a shared cache, its own races are closed on the side of
     * the store, and a second request is not worth it for its sake. The "the list is
     * empty" condition does not do instead: an empty list is a legitimate answer for
     * the first page of a project, and the store is what tells emptiness from
     * not-loaded.
     *
     * @param address - The page address out of the URL.
     * @param generation - The generation of this session opening.
     */
    async function bootstrapSession(
        address: IBricksPageAddress,
        generation: number
    ): Promise<void> {
        await publishStore.ensurePagesLoaded();

        if (!isCurrentSession(generation)) {
            return;
        }

        const existingPage = publishStore.getPageByAddress(address);
        // A draft is read by the editing right alone (why — in IBuilderSessionOptions)
        const draft = canEdit.value ? getBuilderDraft(draftPrincipal, address) : null;

        if (existingPage) {
            publishStore.startEditingPage(existingPage.id);
            sessionPageId.value = existingPage.id;

            // The list of the store holds summaries with no schema: the canvas
            // schema is loaded with a point lookup
            const fullPage = await fetchPageRequest(existingPage.id);

            if (!isCurrentSession(generation)) {
                return;
            }

            componentsStore.loadSchema(fullPage.schema, { resetHistory: true });

            savedSnapshot.value = buildCurrentSnapshot();

            // A draft is offered for restoring only when it certainly belongs to this
            // page (draft.pageId === existingPage.id). A draft with no pageId or with
            // somebody else's (the session key reused after a Save as Copy, for one)
            // is stale: it is not offered and is swept up below.
            const isDraftOwnedByPage = draft?.pageId === existingPage.id;

            if (
                draft &&
                draft.mode === 'edit' &&
                draft.draftSnapshot &&
                isDraftOwnedByPage &&
                !isSnapshotEqual(draft.draftSnapshot, savedSnapshot.value)
            ) {
                // The offer is only armed here: there is nothing to ask with in the
                // middle of a load — the window would climb over the loader. The page
                // raises the toast once the loader has left, and a click on it opens
                // the window
                armDraftPrompt(draft, generation);
                return;
            }

            if (draft && draft.mode === 'edit' && draft.draftSnapshot) {
                discardDraft(address);
            }

            return;
        }

        publishStore.startNewPublish();
        publishStore.setCurrentFormField('pagename', address.pagename);
        // The prefix out of the URL is part of the address being opened as well:
        // without it the form of a new page would save it into the root, while the
        // editor stands at `/blog/post`
        publishStore.setCurrentFormField('urlPrefix', address.urlPrefix);
        componentsStore.loadSchema(EMPTY_SCHEMA, { resetHistory: true });

        if (draft?.draftSnapshot) {
            applySnapshot(draft.draftSnapshot);
            showToast(t('bricks.publish.toasts.unsavedChanges'), 'error', 30000);
        }
    }

    /**
     * Bounds the waiting of the bootstrap in time. A timer of its own rather than an
     * `AbortSignal` on the request: what has to be put out is the whole opening, the
     * branch that has passed the list already and waits for the schema included.
     *
     * @param bootstrap - The promise of the session opening.
     * @returns A promise that rejects once the limit runs out.
     */
    async function withBootstrapTimeout(bootstrap: Promise<void>): Promise<void> {
        if (typeof window === 'undefined') {
            return bootstrap;
        }

        let timer: number | null = null;
        const deadline = new Promise<never>((_resolve, reject) => {
            timer = window.setTimeout(() => {
                reject(new Error(t('bricks.publish.session.errorTimeout')));
            }, SESSION_BOOTSTRAP_TIMEOUT_MS);
        });

        try {
            await Promise.race([bootstrap, deadline]);
        } finally {
            if (timer !== null) {
                window.clearTimeout(timer);
            }
        }
    }

    /**
     * Loads a page into the builder by its address, drafts taken into account.
     *
     * @param address - The page address out of the URL.
     */
    async function openBuilderSession(address: IBricksPageAddress): Promise<void> {
        if (!address.pagename) {
            return;
        }

        abandonSessionOperations();
        const generation = sessionToken.capture();

        // The session key is fixed here: drafts are written and removed under it until
        // the next opening or rename (see useBuilderSessionAddress.renameSession)
        sessionAddress.value = address;

        isSessionLoading.value = true;
        isSessionReady.value = false;
        sessionError.value = null;
        resolveDraftPrompt();
        savedSnapshot.value = null;
        // The page being opened is not identified yet: until the bootstrap ends it
        // is "the current one" for no row of the list
        sessionPageId.value = null;

        try {
            await withBootstrapTimeout(bootstrapSession(address, generation));

            if (!isCurrentSession(generation)) {
                return;
            }

            // Readiness comes only after every branch of the bootstrap, the
            // application of a draft included: a failure there with the flag already
            // raised would mean the flush on unload overwrites the draft with a
            // half-assembled state.
            //
            // An unanswered offer no longer holds readiness back: what lies on the
            // canvas is the saved version — the state is consistent and may be edited,
            // and the very first edit takes the offer down (`armSupersedeWatch`).
            // While there is no answer, `isDraftRestorePending` keeps the autosave
            // from REMOVING the record as matching the saved version; the write goes on
            isSessionReady.value = true;
        } catch (error: unknown) {
            // The error of a displaced opening no longer concerns the person: what is
            // on the screen is another page, loading under a generation of its own
            if (!isCurrentSession(generation)) {
                return;
            }

            // A request cut off by its own ceiling is, to a person, the same event as
            // the whole bootstrap running out of time: the same product text is shown
            // rather than the transport message about a read timeout. Otherwise one
            // screen would explain an unresponsive server in two different phrases
            // depending on whose timer fired
            const message = isRequestTimeoutError(error)
                ? t('bricks.publish.session.errorTimeout')
                : error instanceof Error
                  ? error.message
                  : t('bricks.publish.toasts.loadPageFailed');

            // An opening abandoned on the timeout may still be in flight: it is put
            // out by the generation, otherwise a late answer would land on the canvas
            // over the error screen. The loader is lowered right here — `finally` will
            // see the generation as stale already
            sessionToken.invalidate();
            isSessionLoading.value = false;

            // The screen and the toast do not duplicate each other: the screen
            // explains the state and keeps the workspace closed, the toast marks the
            // fact of the failure — otherwise a second refusal under "Retry" would
            // look like "nothing happened"
            sessionError.value = message;
            showToast(message, 'error');
        } finally {
            // Only the current opening has the right to lower the loader: otherwise a
            // late answer of a displaced one would open the canvas up while the
            // current one is still loading
            if (isCurrentSession(generation)) {
                isSessionLoading.value = false;
            }
        }
    }

    /**
     * Repeats the opening of a session after a refused bootstrap — the "Retry"
     * button on the blocking screen. The address is taken out of the route: it is
     * the source of truth of the URL, and after a failed opening `sessionAddress`
     * equals it.
     */
    async function retryBuilderSession(): Promise<void> {
        await openBuilderSession(routeAddress.value);
    }

    // A move of the session cancels the offer to restore a draft. `renameSession` is
    // called directly by an already started save or Save as Copy, so `sessionAddress`
    // changes without a change of the generation, while `migrateBuilderDraft` has
    // moved the record under the new key by then: "Restore" would apply the snapshot
    // of the former page and "Discard" would sweep an empty old key. Nothing is
    // touched — the draft stays on the disk, and a reload brings the offer back.
    watch(
        () => sessionAddress.value,
        (next, previous) => {
            if (!isDraftRestorePending.value || isSamePageAddress(next, previous)) {
                return;
            }

            resolveDraftPrompt();
        }
    );

    // No immediate: under it the callback runs synchronously in setup before the
    // hydration and manages to fill publishStore.currentFormState in (the pagename out
    // of the URL), which makes the client render diverge from the SSR one (a hydration
    // mismatch in TheBuilderShellToolbar). The first opening is in the onMounted of
    // the page; the watcher answers for a change of the route only.
    watch(
        () => routeAddress.value,
        (next) => {
            // routeAddress has caught up with sessionAddress after a renameSession
            // — a rename of the session's own address rather than a navigation, so no
            // second bootstrap is needed. The comparison is by the whole address: a
            // change of the prefix is another page too
            if (!next.pagename || isSamePageAddress(next, sessionAddress.value)) {
                return;
            }

            openBuilderSession(next).catch((error: unknown) => {
                console.error('[Builder] Failed to open builder session:', error);
            });
        }
    );

    return {
        isSessionLoading,
        isSessionReady,
        sessionError,
        sessionPageId,
        isDraftRestorePending,
        isRestoreDraftModalOpen,
        pendingDraft,
        savedSnapshot,
        buildCurrentSnapshot,
        commitSavedSnapshot,
        switchToSavedPage,
        openBuilderSession,
        retryBuilderSession,
        openRestoreDraftModal,
        handleDeferDraft,
        handleRestoreDraft,
        handleDiscardDraft,
    };
}
