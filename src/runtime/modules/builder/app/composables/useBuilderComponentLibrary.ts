// #region Imports
// Types
import type { IUseBuilderComponentLibraryReturn } from '../types/composables';

// Vue
import { useI18n } from 'vue-i18n';

// Composables
import { useComponentLibrary } from './useComponentLibrary';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
// #endregion

/**
 * The component library of the editor together with the way its refusals reach a
 * person: the retry button of the sidebar and the toast.
 *
 * Awaited LAST by its caller, and its own await is its last statement for the same
 * reason. After an await the active effect scope is lost (`getCurrentScope()` →
 * undefined), and a `watch` registered in a lost scope does not stop on unmount: every
 * repeated visit to the builder would leave a live closure over dead refs, and a
 * mutation of a global store would poke the handlers of every past instance. That is why
 * the whole synchronous wiring of the editor (`useBuilderWorkspace`) goes above, while
 * the library is awaited here — its value is needed in the return alone.
 *
 * @returns The library, its state and the two ways its refusal is reported.
 */
export async function useBuilderComponentLibrary(): Promise<IUseBuilderComponentLibraryReturn> {
    const { t } = useI18n();
    const { showToast } = useBuilderToast();

    const {
        componentLibraryList,
        skippedBricks,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading,
        refreshComponentLibrary,
    } = await useComponentLibrary();

    /**
     * Retries the load of the library on the button of the sidebar; a second refusal
     * is reported with a toast again — the button itself stays where it is.
     */
    async function handleRetryComponentLibrary(): Promise<void> {
        const isLoaded = await refreshComponentLibrary();

        if (!isLoaded) {
            showToast(t('bricks.library.loadFailed'), 'error');
        }
    }

    /**
     * Reports a refused load of the library. The showing is not done right here but
     * left to the page (its `onMounted`): the composable is awaited in setup, on SSR
     * too, where there is nobody to show a toast to, and the toast itself belongs to
     * the page — the page is what owns its mounting.
     *
     * The toast is needed together with the retry block in the sidebar rather than
     * instead of it: the block is visible only while the library is open, that is,
     * one could otherwise learn of a refusal by chance alone.
     *
     * A refusal and the skips may both be true at once (the list arrived out of the
     * snapshot of a previous load and the fresh request never came), but the toast is
     * one: the toast is a singleton, and a second one would simply overwrite the
     * first. The priority is with the refusal of the endpoint — it is both fresher
     * and mended by a retry.
     */
    function notifyComponentLibraryFailure(): void {
        if (isComponentLibraryLoadFailed.value) {
            showToast(t('bricks.library.loadFailed'), 'error');
            return;
        }

        if (skippedBricks.value.length > 0) {
            showToast(
                t('bricks.library.skippedBricks', { count: skippedBricks.value.length }),
                'error'
            );
        }
    }

    return {
        componentLibraryList,
        skippedBricks,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading,
        handleRetryComponentLibrary,
        notifyComponentLibraryFailure,
    };
}
