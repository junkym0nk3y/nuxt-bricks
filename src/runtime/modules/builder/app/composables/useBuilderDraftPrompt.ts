// #region Imports
// Types
import type { IBuilderDraftEntry } from '../../publish/types/builderDrafts';
import type { IBuilderDraftPromptOptions } from '../types/session';

// Utils
import { isFormStateEqual } from '../../publish/utils/draftSnapshots';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { ref, watch } from 'vue';

// Pinia
import { useHistoryStore } from '../../core/stores/history';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * The offer to restore a found draft: the "there is a draft and no answer" state,
 * the window with the choice and three outcomes — restore, discard, defer.
 *
 * The offer does not hold the readiness of the session back: what lies on the
 * canvas is the saved version of the page, it may be edited, and the offer hangs
 * beside it as a toast. Instead of readiness the state guards the draft record from
 * REMOVAL — while there is no answer the autosave does not delete it
 * (`useBuilderDraftPersistence`), otherwise a match with the saved version would
 * take the offered snapshot away before the answer. The write is not held back.
 *
 * The owner of the offer is `useBuilderSession`: it arms the offer on the bootstrap
 * and takes it down when the session is reopened.
 */
export function useBuilderDraftPrompt(options: IBuilderDraftPromptOptions) {
    const { isCurrentSession, applySnapshot, discardDraft, sessionAddress, savedSnapshot } =
        options;

    const historyStore = useHistoryStore();
    const publishStore = usePublishStore();

    // A draft is found and unanswered: it holds the toast on the screen and the
    // ban on the autosave touching the record
    const isDraftRestorePending = ref(false);
    const isRestoreDraftModalOpen = ref(false);
    const pendingDraft = ref<IBuilderDraftEntry | null>(null);

    // The generation of the opening that found the draft — together with the
    // `pointer-events: none` on the leaving modal (transitions.scss) it closes a
    // late answer: a click on an offer already taken down would answer for another
    // session, one still loading or one that failed. It is nulled after an answer,
    // which makes an answer one-shot as well: a second click on the same window is
    // a no-op.
    let promptGeneration: number | null = null;

    /** Stops the watcher of the first edit of one's own (see `armSupersedeWatch`). */
    let stopSupersedeWatch: (() => void) | null = null;

    /**
     * Whether the answer belongs to the current opening of the session. It cuts off
     * both a late click on the offer of a former session and a second answer.
     *
     * @returns Whether the answer may be applied.
     */
    function isAnswerCurrent(): boolean {
        return promptGeneration !== null && isCurrentSession(promptGeneration);
    }

    /**
     * Takes the offer down whole: the toast, the window, the snapshot in memory and
     * the ban on the autosave. The single exit out of the "a draft is found and
     * unanswered" state — used both by the answers of a person and by the offer
     * being displaced (the first edit, a move or a reopening of the session).
     */
    function resolveDraftPrompt(): void {
        stopSupersedeWatch?.();
        stopSupersedeWatch = null;

        isDraftRestorePending.value = false;
        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
        promptGeneration = null;
    }

    /**
     * Takes the offer down on the first edit made by the person: from that moment
     * on the autosave will rewrite the draft with the current state, and there will
     * be nothing left to restore — the offered snapshot is displaced already.
     *
     * Two watchers rather than one, because the sources are not of equal worth:
     *
     * - a new record in the history of the canvas only ever comes from an action of
     *   a person — the offer is taken down at once;
     * - the publish form is rewritten by housekeeping code as well. Every save
     *   assigns `published` anew (`useBuilderPageWrite`), with the same value
     *   included — taken for an edit, that would take the offer down by itself and
     *   the autosave would then remove the draft as matching the saved version. So
     *   here the check is against the saved version: while the form does not differ
     *   from it, there has been no edit.
     *
     * `flush: 'sync'` is there so that the offer is taken down at the moment of the
     * mutation rather than through the queue: between the pre-watchers and the
     * synchronous flush of the draft on the unload of the page the order is
     * otherwise not guaranteed.
     */
    function armSupersedeWatch(): void {
        stopSupersedeWatch?.();

        const stopHistoryWatch = watch(
            () => historyStore.history[historyStore.historyIndex],
            () => {
                resolveDraftPrompt();
            },
            { flush: 'sync' }
        );

        const stopFormWatch = watch(
            () => publishStore.currentFormState,
            (formState) => {
                const savedFormState = savedSnapshot.value?.formState;

                if (savedFormState && isFormStateEqual(formState, savedFormState)) {
                    return;
                }

                resolveDraftPrompt();
            },
            { flush: 'sync' }
        );

        stopSupersedeWatch = () => {
            stopHistoryWatch();
            stopFormWatch();
        };
    }

    /**
     * Arms the offer over a found draft. Called on the bootstrap, before readiness
     * is raised: there is nothing to ask with in the middle of a load — the window
     * would climb over the loader, so showing the toast is left to the page.
     *
     * @param draft - The draft record that was found.
     * @param generation - The generation of the session opening that found it.
     */
    function armDraftPrompt(draft: IBuilderDraftEntry, generation: number): void {
        pendingDraft.value = draft;
        isDraftRestorePending.value = true;
        promptGeneration = generation;
        armSupersedeWatch();
    }

    /**
     * Stops the watcher without taking the offer itself down. Needed when a session
     * is put out: the watcher is set outside an active scope (after the awaits of
     * the bootstrap) and would not stop itself.
     */
    function stopDraftPromptWatch(): void {
        stopSupersedeWatch?.();
        stopSupersedeWatch = null;
    }

    /**
     * Opens the window with the choice — on a click in the toast. A late click on
     * the toast of a former session is cut off by the same generation as the
     * answers in the window itself.
     */
    function openRestoreDraftModal(): void {
        if (!isAnswerCurrent()) {
            return;
        }

        isRestoreDraftModalOpen.value = true;
    }

    /**
     * Closes the window without answering: X, Esc and a click on the backdrop. The
     * draft stays on the disk, the offer stays on the screen. Closing has stopped
     * being a removal: a miss of the button used to carry unsaved work away with no
     * way back.
     */
    function handleDeferDraft(): void {
        isRestoreDraftModalOpen.value = false;
    }

    /**
     * Restores the changes out of a draft on top of the already open saved version.
     */
    function handleRestoreDraft(): void {
        if (!isAnswerCurrent()) {
            return;
        }

        const draft = pendingDraft.value;

        // The offer is taken down before the application: the snapshot goes into
        // the stores, and the watcher of the first edit looks at exactly those —
        // otherwise it would take the offer down itself, after the window had
        // closed already, and the order would become non-obvious
        resolveDraftPrompt();

        if (draft?.draftSnapshot) {
            applySnapshot(draft.draftSnapshot);
        }
    }

    /**
     * Removes a draft on an explicit demand of the person and leaves the saved
     * version on the canvas. The only path on which a draft disappears by an
     * answer: closing the window and closing the toast merely defer.
     */
    function handleDiscardDraft(): void {
        if (!isAnswerCurrent()) {
            return;
        }

        // The key is taken off the draft itself: it is what the answer is about.
        // It has no time to diverge from `sessionAddress` — a move of the session
        // takes the offer down whole (the watcher in useBuilderSession)
        const draft = pendingDraft.value;
        const address = draft
            ? toPageAddress(draft.pagename, draft.urlPrefix)
            : sessionAddress.value;

        if (address.pagename) {
            discardDraft(address);
        }

        resolveDraftPrompt();
    }

    return {
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
    };
}
