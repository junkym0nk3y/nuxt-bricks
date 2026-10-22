// #region Imports
// Types
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderSessionAddressSyncOptions } from '../types/session';

// Utils
import {
    getPageAddressKey,
    isValidPageAddress,
    toPageAddress,
} from '../../../common/utils/bricks/pageAddress';

// Vue
import { onScopeDispose, watch } from 'vue';

// Composables
import { useBricksPageAddress } from '../../../common/composables/useBricksPageAddress';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

const ADDRESS_SYNC_DEBOUNCE_MS = 600;

/**
 * Synchronization of the URL with the address out of the publish settings
 * (debounce 600 ms): for a new (unsaved) page it moves the session onto the new
 * address through `renameSession` — the localStorage draft migrates, the URL
 * changes through Vue Router. For an existing page the rename is applied on the
 * save instead (see `useBuilderPageWrite`).
 *
 * It follows the `pagename + urlPrefix` pair rather than the name alone: the
 * address of the editor includes the prefix, so a change of the prefix is as much
 * a move of the session as a rename is, and without it the URL and the key of the
 * draft would stay behind on the previous address.
 */
export function useBuilderSessionAddressSync(options: IBuilderSessionAddressSyncOptions): void {
    const { renameSession, isSessionReady } = options;
    const publishStore = usePublishStore();
    const { isEditorAddressFree } = useBricksPageAddress();

    let addressRouteTimer: number | null = null;

    /**
     * Stops the deferred synchronization.
     */
    function clearAddressTimer(): void {
        if (addressRouteTimer !== null) {
            window.clearTimeout(addressRouteTimer);
            addressRouteTimer = null;
        }
    }

    /**
     * Whether the state of the store allows the session to be moved by the form:
     * the session is open to a consistent state, the page is not saved yet (the
     * rename of an existing one is applied on the save, see `useBuilderPageWrite`)
     * and no write is under way.
     *
     * The `isSubmitting` check is not a belt-and-braces one: for the duration of
     * the POST `saveCurrentPageAsCopy` puts `editingPageId = null` and the address
     * of the copy into the form, that is, to this watcher the form looks like a new
     * page. The address of the copy is not taken on the server yet, so the move
     * would pass every other check, and on a failed request the store would roll
     * the form back — the URL and the key of the draft would stay on the address of
     * a copy that does not exist.
     *
     * The readiness check closes the second hole of the same class: a rename inside
     * an unfinished opening changes `sessionAddress` and the URL but not the
     * generation of the session, and the route watcher then skips the new opening
     * deliberately (the route has caught up with sessionAddress). The unfinished
     * bootstrap would count as the current one and would apply the former page
     * under the new key.
     *
     * @returns Whether the session may be moved right now.
     */
    function isSessionRenamable(): boolean {
        return (
            isSessionReady.value &&
            publishStore.editingPageId === null &&
            !publishStore.isSubmitting
        );
    }

    /**
     * Checks that the address fits a move of the session: a valid format, a free
     * address of the EDITOR, not taken by another page.
     *
     * The live address has nothing to do with it: the move changes the URL of the
     * editor, while a taken live address keeps the form invalid and blocks the
     * write anyway.
     *
     * @param address - The candidate address out of the form.
     */
    function isRenameTarget(address: IBricksPageAddress): boolean {
        return (
            isValidPageAddress(address) &&
            isEditorAddressFree(address) &&
            publishStore.isAddressAvailable(address)
        );
    }

    /**
     * The address assembled out of the current fields of the form.
     *
     * @returns The normalized address of the form.
     */
    function resolveFormAddress(): IBricksPageAddress {
        return toPageAddress(
            String(publishStore.currentFormState.pagename ?? ''),
            publishStore.currentFormState.urlPrefix
        );
    }

    // What is watched is the KEY of the address rather than the object itself: the
    // object is reassembled on every run of the getter, so a comparison by
    // reference would count any rewrite of the form as a change — a housekeeping
    // one, for instance (`setCurrentFormState` after a save). The key is a string,
    // and the watcher fires on a real change of the address only.
    watch(
        () => getPageAddressKey(resolveFormAddress()),
        () => {
            if (typeof window === 'undefined') {
                return;
            }

            // The early exits clear the timer already set: it was planned for
            // the former state of the form, and by the time it fires that state
            // is a different one
            if (!isSessionRenamable()) {
                clearAddressTimer();
                return;
            }

            if (!isValidPageAddress(resolveFormAddress())) {
                clearAddressTimer();
                return;
            }

            // Debounce: the URL and the key of the draft catch up with the form
            // after a pause in the typing
            clearAddressTimer();
            addressRouteTimer = window.setTimeout(() => {
                addressRouteTimer = null;

                // The mode and the write are rechecked as of the moment of
                // firing: within the debounce window the page may have been saved
                // or started being saved
                if (!isSessionRenamable()) {
                    return;
                }

                const current = resolveFormAddress();

                if (!isRenameTarget(current)) {
                    return;
                }

                renameSession(current).catch((error: unknown) => {
                    console.warn('[Builder] Failed to sync page address to URL:', error);
                });
            }, ADDRESS_SYNC_DEBOUNCE_MS);
        }
    );

    onScopeDispose(clearAddressTimer);
}
