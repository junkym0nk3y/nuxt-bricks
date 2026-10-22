/**
 * Confirm Modal types
 */

export interface IBricksConfirmModalProps {
    isOpen: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: import('../base/button/types.d.ts').TBricksButtonVariant;
    isLoading?: boolean;
}

export interface IBricksConfirmModalEmits {
    close: [];
    confirm: [];
    /** The dialog has left the DOM: the next modal may be opened (see IBricksModalEmits) */
    afterLeave: [];
}

/**
 * Toast types
 */

export type TBricksToastVariant = 'success' | 'error' | 'info';

export interface IBricksToastProps {
    visible: boolean;
    message: string;
    variant?: TBricksToastVariant;
    autoHide?: boolean;
    duration?: number;
    /**
     * Caption of the action button. Empty means a toast without an action:
     * neither a button nor a reaction to a click on the body.
     */
    actionLabel?: string;
}

export interface IBricksToastEmits {
    'update:visible': [value: boolean];
    /** The action button has been pressed */
    action: [];
    /**
     * A click on the toast body away from the buttons. Kept separate from
     * `action`: the button is a shortcut to the action itself, the body means
     * "show me the details", and folding them into one event loses that
     * difference.
     */
    select: [];
}

/**
 * Empty state size:
 * - `md` — a section or a modal: the glyph sits in a circle, `1.6rem` bold title,
 *   a description and room for an action;
 * - `sm` — a sidebar panel and a popover: no circle, a quieter `1.4rem` title,
 *   and a larger but paler glyph, which without the circle has to carry the state
 *   on its own.
 *
 * Two steps instead of two components: the difference is the circle and the type
 * scale, while the structure (glyph, title, description, action) is one and the
 * same.
 */
export type TBricksEmptyStateSize = 'md' | 'sm';

export interface IBricksEmptyStateProps {
    /** State title — what exactly is empty */
    title: string;
    /** Glyph; without it the state stays textual */
    icon?: string;
    /** Note under the title: what to do to make it non-empty */
    description?: string;
    size?: TBricksEmptyStateSize;
}

/**
 * Placeholder shape: `line` for a line of text (pill radius), `block` for a tile
 * or a preview (`xs` radius).
 *
 * The geometry (width, height, proportions) is set by the caller through its own
 * class: across the four places where placeholders were already written it
 * differs in all of them, and overriding a class with a class means depending on
 * style order. What they do share is exactly the background, and that is what
 * moves here — it is also what had drifted apart (`base-100` against `base-200`
 * in the media library).
 */
export type TBricksSkeletonShape = 'line' | 'block';

export interface IBricksSkeletonProps {
    shape?: TBricksSkeletonShape;
}
