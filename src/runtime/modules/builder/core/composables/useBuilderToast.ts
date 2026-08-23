// #region Imports
// Types
import type { IBuilderActionToastOptions, IBuilderToastState } from '../types/toast';

// Vue
import { computed, reactive } from 'vue';
// #endregion

/**
 * How long an ordinary toast stays up, in milliseconds. Owned here rather than by
 * the hosts: the state field is optional, and every screen drawing the toast used to
 * carry a fallback of its own — three copies of one number that drift apart one at a
 * time.
 */
const DEFAULT_TOAST_DURATION = 4000;

// Module singleton: one state for the whole application, so that a toast can be
// shown both by the builder page and by deep descendants (the canvas context menu)
const toast = reactive<IBuilderToastState>({
    visible: false,
    message: '',
    variant: 'success',
    duration: DEFAULT_TOAST_DURATION,
    autoHide: true,
    actionLabel: '',
    onAction: null,
    onSelect: null,
    token: 0,
});

/** Duration of a toast awaiting an answer: it hides on the action, the cross or a swipe */
const PERSISTENT_TOAST_DURATION = 0;

/**
 * State of the builder toast notification and the single function that shows it.
 */
export function useBuilderToast() {
    /**
     * Shows a toast with a message, a variant and a duration.
     *
     * @param message - Text of the notification.
     * @param variant - Kind of the notification.
     * @param duration - How long it stays up, in milliseconds.
     * @returns Sequence number of the toast, to pass to `hideToast`.
     */
    function showToast(
        message: string,
        variant: IBuilderToastState['variant'] = 'success',
        duration = DEFAULT_TOAST_DURATION
    ): number {
        toast.message = message;
        toast.variant = variant;
        toast.duration = duration;
        toast.autoHide = true;
        toast.actionLabel = '';
        toast.onAction = null;
        toast.onSelect = null;
        toast.token += 1;
        toast.visible = false;

        requestAnimationFrame(() => {
            toast.visible = true;
        });

        return toast.token;
    }

    /**
     * Shows a toast that waits for a user action: it never hides by itself and it carries
     * a button. A click on the body runs a separate handler, not the button: the caller
     * gives the two different operations — restoring a draft against opening the window
     * that shows what would be restored.
     *
     * @param options - Text, action label, handlers and variant.
     * @returns Sequence number of the toast, to pass to `hideToast`.
     */
    function showActionToast(options: IBuilderActionToastOptions): number {
        showToast(options.message, options.variant ?? 'info', PERSISTENT_TOAST_DURATION);

        toast.autoHide = false;
        toast.actionLabel = options.actionLabel;
        toast.onAction = options.onAction;
        toast.onSelect = options.onSelect ?? null;

        return toast.token;
    }

    /**
     * Hides the toast when it is still the one on screen: another message that has
     * already replaced it must not be cut off, it is about a different event.
     *
     * @param token - Sequence number returned by `showToast` / `showActionToast`.
     */
    function hideToast(token: number): void {
        if (toast.token !== token) {
            return;
        }

        toast.visible = false;
    }

    // The duration for the component: the state field is optional (a toast awaiting
    // an answer sets 0 deliberately), and the fallback belongs next to the default
    // rather than in every screen that draws the toast
    const toastDuration = computed<number>(() => toast.duration ?? DEFAULT_TOAST_DURATION);

    return { toast, toastDuration, showToast, showActionToast, hideToast };
}
