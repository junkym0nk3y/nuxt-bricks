// #region Imports
// Types
import type { IPublishedPage } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderDraftSnapshot } from '../../publish/types/builderDrafts';
import type {
    IBuilderSessionSnapshotOptions,
    IUseBuilderSessionSnapshotReturn,
} from '../types/session';

// Utils
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { serializeSchema } from '../../core/utils/history';
import { removeBuilderDraft } from '../../publish/utils/draftStorage';

// Vue
import { ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * The saved state of a builder session: what the canvas and the publish form looked
 * like at the last save, plus the identity of the page that state belongs to.
 *
 * Split out of `useBuilderSession` as one invariant rather than a bag of callbacks:
 * `savedSnapshot`, the draft under the session key and `sessionPageId` are written
 * together and would go out of step if they lived apart — a snapshot committed
 * without removing the draft brings the offer to restore an already saved state
 * back on the next visit.
 *
 * The generation is only READ here (`isCurrent`): raising it belongs to the owner of
 * the openings, `useBuilderSession`.
 *
 * @param options - The session key, the move of the session and the token.
 */
export function useBuilderSessionSnapshot(
    options: IBuilderSessionSnapshotOptions
): IUseBuilderSessionSnapshotReturn {
    const { sessionAddress, renameSession, sessionToken, draftStorageNotice, draftPrincipal } =
        options;

    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    const savedSnapshot = ref<IBuilderDraftSnapshot | null>(null);

    // The identity of the open page: the id of a saved one, or null for a new one. It
    // changes on the moves of a session only, which makes it fit as the "this page is
    // open" sign for the interface. `publishStore.editingPageId` does not do for that:
    // for the duration of the POST Save as Copy resets it to null (the form looks like
    // a new page), and the mark of the current row would blink on every save of a
    // copy. A comparison by pagename does even less — it does not tell a deleted page
    // from one created anew under the same slug.
    const sessionPageId = ref<string | number | null>(null);

    /**
     * Removes a draft and reports a refusal of the storage. A silent refusal here
     * would mean that a draft turned down or already saved is offered for restoring
     * again on the next visit.
     *
     * @param address - The session address the draft lies under.
     */
    function discardDraft(address: IBricksPageAddress): void {
        if (!removeBuilderDraft(draftPrincipal, address)) {
            draftStorageNotice.report();
        }
    }

    /**
     * Builds the current snapshot out of the canvas store and the publish settings.
     */
    function buildCurrentSnapshot(): IBuilderDraftSnapshot {
        return {
            schema: serializeSchema(componentsStore.components),
            formState: publishStore.currentFormState,
        };
    }

    /**
     * Applies a snapshot into the builder stores.
     *
     * @param snapshot - The snapshot to apply.
     */
    function applySnapshot(snapshot: IBuilderDraftSnapshot): void {
        componentsStore.loadSchema(snapshot.schema, { resetHistory: true });
        publishStore.setCurrentFormState(snapshot.formState);
    }

    /**
     * Commits the current state as the saved one: a new `savedSnapshot` and the
     * removal of the draft under the current session key. The single point of the
     * commit, called by both writing paths
     * (`useBuilderPageWrite.submitPageWithPublishState` and `switchToSavedPage`).
     *
     * An explicit call instead of the former watcher on
     * `publishStore.lastSuccessfulSaveAt`: the watcher did not know the initiator, so
     * a save of the former page arriving after a new one had been opened declared the
     * snapshot of the new one saved and removed its draft — the edits made before the
     * save were lost on a reload. A navigation caught inside the `await renameSession`
     * that both paths stand would bring exactly that defect back, which is why the
     * token is checked here rather than at the caller.
     *
     * @param capturedToken - The session token taken at the start of the save.
     */
    function commitSavedSnapshot(capturedToken: number): void {
        if (!sessionToken.isCurrent(capturedToken)) {
            return;
        }

        savedSnapshot.value = buildCurrentSnapshot();
        discardDraft(sessionAddress.value);

        // Right here the session takes on the identity of the saved page: both writes
        // have put the store into edit mode by this moment, and the first save of a
        // new page would otherwise leave the session nameless until a reload — the
        // list would carry no mark that this is what is open
        sessionPageId.value = publishStore.editingPageId;
    }

    /**
     * The single move of a session onto a saved page (Save as Copy). The order is
     * fixed — otherwise the URL and the key of the draft stay behind from the
     * original: the autosave of the copy would write under the address of the
     * original, and a reload of the original would offer to restore somebody else's
     * data. The address is taken off the saved row whole: a copy inherits the
     * `urlPrefix`, and a move by the name alone would take the URL of the editor into
     * the root.
     *
     * @param page - The normalized page of the copy (`id` and the address are
     * mandatory).
     */
    async function switchToSavedPage(page: IPublishedPage): Promise<void> {
        const startedIn = sessionToken.capture();

        publishStore.startEditingPage(page.id);
        await renameSession(toPageAddress(page.pagename, page.urlPrefix));
        commitSavedSnapshot(startedIn);
    }

    return {
        savedSnapshot,
        sessionPageId,
        buildCurrentSnapshot,
        applySnapshot,
        discardDraft,
        commitSavedSnapshot,
        switchToSavedPage,
    };
}
