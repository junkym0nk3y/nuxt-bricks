// #region Imports
// Types
import type { IBuilderSessionLockState } from '../types/builder';
import type {
    IBuilderSessionFeedbackOptions,
    IUseBuilderSessionFeedbackReturn,
} from '../types/session';

// Utils
import { isBuilderInterfaceLocked, isBuilderWorkspaceLocked } from '../utils/sessionLock';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderToast } from '../../core/composables/useBuilderToast';
// #endregion

/**
 * What the person sees of the state of a session: the loader, the barriers over the
 * interface and the offer to restore a found draft.
 *
 * A controller of its own rather than part of the page: the three states hold one
 * rule between them — the offer may be raised only after the loader has left, and it
 * is taken down by the very events that end the session. Spread over the composition
 * root, that rule read as four unrelated watchers.
 *
 * @param options - The state of the session and the two ways out of the offer.
 */
export function useBuilderSessionFeedback(
    options: IBuilderSessionFeedbackOptions
): IUseBuilderSessionFeedbackReturn {
    const {
        isSessionLoading,
        isSessionReady,
        sessionError,
        isDraftRestorePending,
        isRestoreDraftModalOpen,
        handleRestoreDraft,
        openRestoreDraftModal,
    } = options;

    const { t } = useI18n();
    const { toast, showActionToast, hideToast } = useBuilderToast();

    // The loader is on the screen. Apart from `isSessionReady`, because the two always
    // diverge: a session opens faster than the animation cycle of the loader runs, and
    // in that tail (up to about 2 s on a quick load) the interface is released already
    // while a person sees "loading" — the clicks into the toolbar and the rail used to go
    // under the loader. It starts true: the loader is mounted along with the page
    const isLoaderVisible = ref(true);

    // The number of the showing of the toast offering to restore a draft: it is what
    // puts the toast out as well. By the number rather than by a visibility flag — the
    // state of the toast is one per application, and somebody else's message that
    // replaced ours must not be taken down
    const draftToastToken = ref<number | null>(null);

    // What is at stake is a silently lost edit: before readiness the autosave turns one
    // down by !isSessionReady, the canvas is then overwritten by the incoming schema,
    // and an edit of the form travels into savedSnapshot as "already saved", so no draft
    // is created and a reload loses it. Hence three layers in the markup, none of them
    // enough alone. The transparent blocker (`cursor: progress` its only visible sign,
    // `position: fixed` because the root is not positioned) holds the pointer, while the
    // keyboard, an already focused field and the accessibility tree walk past it — that
    // half is closed by `inert`. Where the two flags differ, and why, is in `sessionLock`.
    const lockState = computed<IBuilderSessionLockState>(() => ({
        hasSessionError: sessionError.value !== null,
        isSessionReady: isSessionReady.value,
        isLoaderVisible: isLoaderVisible.value,
    }));
    const isBuilderLocked = computed<boolean>(() => isBuilderInterfaceLocked(lockState.value));
    const isWorkspaceLocked = computed<boolean>(() => isBuilderWorkspaceLocked(lockState.value));

    /**
     * Keeps the offer to restore a draft on the screen until it has been answered: the
     * toast is the only path to the window with the choice, and it must not be lost — it
     * can leave not only by the will of the person, somebody else's message may displace
     * it (the state of the toast is one per application).
     */
    function ensureDraftToast(): void {
        const isOwnToastVisible =
            draftToastToken.value !== null &&
            toast.visible &&
            toast.token === draftToastToken.value;

        if (!isDraftRestorePending.value || isOwnToastVisible) {
            return;
        }

        draftToastToken.value = showActionToast({
            message: t('bricks.publish.draft.pendingTitle'),
            actionLabel: t('bricks.publish.draft.pendingAction'),
            variant: 'info',
            // The button is the short path: the person has chosen the restore already,
            // and the window would ask the same thing a second time. A click on the body
            // leads into the window: the date of the draft and the removal are there
            onAction: handleRestoreDraft,
            onSelect: openRestoreDraftModal,
        });
    }

    /**
     * The loader has left the screen: the interface is released, and when the session
     * holds an unanswered draft this is the very time to offer it. Any earlier is not
     * allowed: a window and a toast in the middle of a load would spoil the look of the
     * loader.
     */
    function handleLoaderHidden(): void {
        isLoaderVisible.value = false;
        ensureDraftToast();
    }

    // A reopening of the session raises the loader anew — and the block with it
    watch(isSessionLoading, (isLoading) => {
        if (!isLoading) {
            return;
        }

        isLoaderVisible.value = true;
    });

    // The offer is taken down — so is the toast: its own life ends together with the
    // offer, the case where the first edit displaced it included (after one there is
    // nothing to restore, the autosave has rewritten the draft with the current state)
    watch(isDraftRestorePending, (isPending) => {
        if (isPending || draftToastToken.value === null) {
            return;
        }

        hideToast(draftToastToken.value);
        draftToastToken.value = null;
    });

    // The window was closed without an answer — the question comes back onto the screen
    // (see `ensureDraftToast`). On an answer an offer already taken down arrives here
    watch(isRestoreDraftModalOpen, (isOpen) => {
        if (isOpen) {
            return;
        }

        ensureDraftToast();
    });

    return {
        isBuilderLocked,
        isWorkspaceLocked,
        handleLoaderHidden,
    };
}
