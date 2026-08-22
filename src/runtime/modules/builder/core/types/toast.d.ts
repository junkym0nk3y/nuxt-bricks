/**
 * Types of the builder toast notifications.
 */

/**
 * State of a toast notification. There is one state for the whole application, so every
 * toast carries a `token`: with it the author of a message hides its own without cutting
 * off another one that has already replaced it (see `useBuilderToast.hideToast`).
 */
export interface IBuilderToastState {
    visible: boolean;
    message: string;
    variant: 'success' | 'error' | 'info';
    duration?: number;
    /** Toast that never auto-hides — it waits for an action or for the user to close it */
    autoHide?: boolean;
    /** Label of the action button; empty means a toast with no action */
    actionLabel?: string;
    /** The action button of the toast — a shortcut to the action itself */
    onAction?: (() => void) | null;
    /** Click on the body of the toast — a separate operation, not the action button */
    onSelect?: (() => void) | null;
    /** Sequence number: `hideToast` tells its own message from the next one by it */
    token: number;
}

/**
 * Options of a toast that waits for a user action.
 */
export interface IBuilderActionToastOptions {
    message: string;
    actionLabel: string;
    onAction: () => void;
    /** Reaction to a click on the body; without it the body behaves as plain text */
    onSelect?: () => void;
    variant?: 'success' | 'error' | 'info';
}
