// #region Imports
// Types
import type { IUseAuthProfileModalReturn, TAuthProfileTab } from '../types/auth';

// Vue
import { ref } from 'vue';
// #endregion

/**
 * Mounting and openness of one's own profile modal.
 *
 * It lives as a composable rather than as a pair of refs in every host: the modal is
 * mounted by both surfaces — the dashboard and the builder — and the mounting latch has
 * to work the same way for them. The latch is never released back — the same decision as
 * the one taken for the media gallery, whose rationale is written down at
 * `useBuilderPage`; on top of that, a chunk already delivered to the browser is not
 * loaded a second time.
 *
 * @returns State of the profile modal, the requested tab and the operations of
 * opening and closing.
 */
export function useAuthProfileModal(): IUseAuthProfileModalReturn {
    // #region Data
    const shouldMount = ref(false);
    const isOpen = ref(false);
    const requestedTab = ref<TAuthProfileTab>('profile');
    // #endregion

    // #region Methods
    /**
     * Opens the modal, mounting it at the first call.
     *
     * The tab is passed by the caller: from the profile menu the profile itself
     * opens, and from one's own row of the "Users" section — the password form,
     * because the key in that row promises exactly it. The default returns the
     * profile, so an open that came for the password once does not stay the password
     * forever.
     *
     * @param tab - Tab to open the modal on.
     */
    function open(tab: TAuthProfileTab = 'profile'): void {
        requestedTab.value = tab;
        shouldMount.value = true;
        isOpen.value = true;
    }

    /**
     * Closes the modal, leaving the component mounted.
     */
    function close(): void {
        isOpen.value = false;
    }
    // #endregion

    return { shouldMount, isOpen, requestedTab, open, close };
}
