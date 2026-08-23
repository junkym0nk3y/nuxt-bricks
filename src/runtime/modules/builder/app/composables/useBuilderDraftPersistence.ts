// #region Imports
// Types
import type { IBuilderDraftPersistenceOptions } from '../types/composables';

// Utils
import { isSnapshotEqual } from '../../publish/utils/draftSnapshots';
import { getPageAddressKey } from '../../../common/utils/bricks/pageAddress';
import {
    isBuilderDraftStorageAvailable,
    removeBuilderDraft,
    setBuilderDraft,
} from '../../publish/utils/draftStorage';

// Vue
import { onScopeDispose, watch } from 'vue';

// Pinia
import { useHistoryStore } from '../../core/stores/history';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * The autosave of a builder draft into localStorage (debounce 800 ms) on a change
 * of the canvas history or of the publish settings. The write always goes through,
 * while the removal of the record waits for an answer to the offer to restore
 * (`isDraftRestorePending`): banning the write along with it is not allowed — an
 * edit of a prop changes the component synchronously and records the history 300 ms
 * later, and a `pagehide` inside that window would lose it. The key of a draft is
 * sessionAddress (it outlives a rename of the session). With no change against the
 * saved version the draft is removed. A deferred save is flushed synchronously on
 * both terminal events: the unload of the page (`pagehide`) and the stop of the
 * scope (leaving the editor by an SPA navigation).
 */
export function useBuilderDraftPersistence(options: IBuilderDraftPersistenceOptions): void {
    const {
        routeAddress,
        sessionAddress,
        isSessionLoading,
        isSessionReady,
        isDraftRestorePending,
        savedSnapshot,
        buildCurrentSnapshot,
        draftStorageNotice,
        canEdit,
    } = options;

    const historyStore = useHistoryStore();
    const publishStore = usePublishStore();

    let persistTimer: number | null = null;

    /**
     * Clears the timer of the deferred save.
     */
    function clearPersistTimer(): void {
        if (persistTimer === null) {
            return;
        }

        window.clearTimeout(persistTimer);
        persistTimer = null;
    }

    /**
     * Saves the draft into localStorage when there are unsaved changes.
     */
    function persistDraftNow(): void {
        if (typeof window === 'undefined') {
            return;
        }

        // Without the editing right the autosave does not touch the draft at all
        // — neither the write nor the removal (why — in
        // IBuilderDraftPersistenceOptions)
        if (!canEdit.value) {
            return;
        }

        // Without isSessionReady the state left after a bootstrap error would get
        // through here (isSessionLoading is lowered in `finally`): saving rubbish
        // would overwrite a valid draft — the more so because the flush on unload
        // is unconditional.
        if (isSessionLoading.value || !isSessionReady.value) {
            return;
        }

        const address = sessionAddress.value;
        if (!address.pagename) {
            return;
        }

        const snapshot = buildCurrentSnapshot();
        const isEditing = publishStore.editingPageId !== null;

        if (isEditing && savedSnapshot.value && isSnapshotEqual(snapshot, savedSnapshot.value)) {
            // While the offer to restore is unanswered, "matches the saved
            // version" means only that the person has changed nothing yet — not
            // that the draft is superfluous: to remove it here is to answer on the
            // person's behalf. Both a housekeeping rewrite of the form (a save
            // assigns `published` anew) and the flush on unload arrive here
            if (isDraftRestorePending.value) {
                return;
            }

            // The outcome matters here too: a draft that was not removed equals
            // the saved state only right now, and after the next edit it will
            // diverge from it again and offer a restore on the next visit
            if (!removeBuilderDraft(address)) {
                draftStorageNotice.report();
            }

            return;
        }

        const isPersisted = setBuilderDraft({
            pagename: address.pagename,
            urlPrefix: address.urlPrefix,
            updatedAt: new Date().toISOString(),
            mode: isEditing ? 'edit' : 'new',
            pageId:
                typeof publishStore.editingPageId === 'number'
                    ? publishStore.editingPageId
                    : undefined,
            savedSnapshot: savedSnapshot.value ?? undefined,
            draftSnapshot: snapshot,
        });

        // The second path to the same message: the probe on entering a session
        // catches a banned storage, while what arrives here is a refusal that has
        // come up during the work already (an exhausted quota on a large schema,
        // for one)
        if (!isPersisted) {
            draftStorageNotice.report();
        }
    }

    /**
     * Schedules a save of the draft (debounce).
     */
    function scheduleDraftPersist(): void {
        if (typeof window === 'undefined' || isSessionLoading.value || !isSessionReady.value) {
            return;
        }

        clearPersistTimer();
        persistTimer = window.setTimeout(() => {
            persistDraftNow();
            clearPersistTimer();
        }, 800);
    }

    /**
     * Saves the draft synchronously on the unload of the page: the debounce timer
     * does not outlive it, so without the flush the changes of the last 800 ms were
     * lost — F5, closing the tab, a soft restart of the dev server over an edit of a
     * brick file.
     *
     * It saves unconditionally rather than only under a scheduled timer: "there is
     * no timer" does not mean "there is nothing to save". An edit of a prop changes
     * the component in the store synchronously and calls `saveToHistory` through a
     * debounce of 300 ms of its own (`core/stores/actions/properties.ts`), so inside
     * that window `historyIndex` is still the previous one, the watcher below has
     * not fired and there is no timer — while `buildCurrentSnapshot` returns the new
     * value already. The price is a possible extra write into localStorage when the
     * timer did manage to run before the unload; it creates no new restore state (in
     * edit mode `persistDraftNow` checks against `savedSnapshot`, and nobody reads
     * the `updatedAt` of a draft).
     */
    function flushDraft(): void {
        clearPersistTimer();
        persistDraftNow();
    }

    // The probe runs on the readiness of the session rather than on the first edit:
    // a banned storage would otherwise be discovered only about 800 ms after the
    // first change on the canvas — that is, the warning would arrive after a person
    // had started working, believing their edits protected.
    //
    // The editing right is a second source of the watch rather than merely a
    // condition inside it: the probe writes into the storage itself, and without the
    // right a role that cannot edit would touch localStorage and would be told about
    // drafts it has none of
    watch([isSessionReady, canEdit], ([isReady, isEditable]) => {
        if (!isReady || !isEditable || isBuilderDraftStorageAvailable()) {
            return;
        }

        draftStorageNotice.report();
    });

    watch(
        // The reference to the current history snapshot rather than
        // `historyIndex`: with the history full, `capture()` raises the index and
        // `clampHistory` puts it right back, so the watched value of the index does
        // not change and the edits of the canvas stopped being autosaved
        // altogether. The snapshot object is a new one per `capture`, and undo/redo
        // move the index — both cases are visible.
        [
            () => historyStore.history[historyStore.historyIndex],
            () => publishStore.currentFormState,
        ],
        () => {
            scheduleDraftPersist();
        },
        { deep: false }
    );

    // A move onto another builder page does not unmount the page (a static page key
    // in `[pagename].vue`), so `onScopeDispose` will not fire, while
    // `openBuilderSession` manages to rewrite `sessionAddress` and lower
    // `isSessionReady` — the deferred save of the former page is otherwise lost.
    // `flush: 'sync'` is mandatory: an ordinary watcher would run after the watcher
    // of the session (that one is registered earlier), that is, already under the
    // key of the new page.
    //
    // The whole address is watched: a move `/bricks/blog/post` → `/bricks/news/post`
    // changes the prefix alone, and a watcher on the name would not notice it — the
    // deferred write of the former page would go out under the key of the new one.
    watch(
        () => getPageAddressKey(routeAddress.value),
        () => {
            flushDraft();
        },
        { flush: 'sync' }
    );

    // pagehide rather than beforeunload: it arrives both when a page moves into the
    // page cache and on mobile, where beforeunload is not guaranteed
    if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', flushDraft);
    }

    onScopeDispose(() => {
        // Leaving the editor for the dashboard is not an unload of the document:
        // `pagehide` will not arrive, and a scheduled save would otherwise simply
        // be thrown away along with the timer. The state at this moment is honest:
        // the stores live at the level of the application, the unmount of the page
        // does not reset them.
        flushDraft();

        if (typeof window !== 'undefined') {
            window.removeEventListener('pagehide', flushDraft);
        }
    });
}
