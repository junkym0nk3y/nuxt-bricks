// #region Imports
// Types
import type { IUsePublishMediaGalleryReturn } from '../types/composables';

// Vue
import { ref } from 'vue';
// #endregion

/**
 * The media gallery modal on the dashboard: the mounting latch and the visibility.
 *
 * It is left with one role — the OG image picker of the page details panel: here
 * picking a file is a step inside another piece of work, so a window on top of the
 * form is appropriate. The file manager is the "Media" section of the rail, and
 * there is no longer a need to tell the contexts apart.
 *
 * The mounting latch is never released: at the start of the dashboard the gallery
 * would pull the lists of files and categories nobody asks an unopened gallery
 * for, while recreating the component after a close would lose the animation.
 *
 * @returns The state of the gallery and the way to open it.
 */
export function usePublishMediaGallery(): IUsePublishMediaGalleryReturn {
    // #region Data
    const shouldMount = ref(false);
    const isOpen = ref(false);
    // #endregion

    // #region Methods
    /**
     * Opens the gallery as the OG image picker.
     */
    function open(): void {
        shouldMount.value = true;
        isOpen.value = true;
    }

    /**
     * Closes the gallery, leaving the component mounted.
     */
    function close(): void {
        isOpen.value = false;
    }
    // #endregion

    return { shouldMount, isOpen, open, close };
}
