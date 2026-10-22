export interface IBricksCloseButtonProps {
    disabled?: boolean;
}

export interface IBricksCloseButtonEmits {
    click: [event: MouseEvent];
}

export type TBricksModalVariant = 'dark' | 'gradient';

/**
 * Modal layer:
 * - `modal` — an ordinary one (the text editor, draft recovery);
 * - `nested` — opened FROM a modal (the media gallery over the text editor);
 * - `raised` — opened from a nested one (the image resolver over the gallery);
 * - `confirm` — a confirmation: always above whatever opened it.
 *
 * A level instead of a raw z-index: each caller used to pick its own number
 * (1000, 10000, 99999, 100001, 999999), and the ordering rested on somebody
 * having taken a figure larger than their neighbor's. The numbers live in the
 * `--bricks-z-*` scale (`assets/scss/shared/_variables.scss`), and all four sit
 * below dropdowns and toasts — otherwise a select inside a modal would once again
 * end up underneath the modal itself.
 */
export type TBricksModalLayer = 'modal' | 'nested' | 'raised' | 'confirm';

export interface IBricksModalProps {
    /** Controlled open state */
    isOpen: boolean;
    /** Title for screen readers (DialogTitle, visually hidden) */
    title: string;
    /**
     * Description for screen readers (DialogDescription, visually hidden);
     * without it aria-describedby is disabled explicitly
     */
    description?: string;
    /** Overlay background: dark or gradient */
    variant?: TBricksModalVariant;
    /** Adds 2rem of padding on the overlay */
    padded?: boolean;
    /** Layer in the overlay scale; `nested` is for a modal opened from a modal */
    layer?: TBricksModalLayer;
    /** Transition duration in ms */
    duration?: number;
}

export interface IBricksModalEmits {
    close: [];
    /** Esc inside the modal; event.preventDefault() cancels the close */
    escapeKeyDown: [event: KeyboardEvent];
    /**
     * The leave animation has finished and the modal has left the DOM. Needed by
     * whoever opens a second modal right after the first: `force-mount` keeps
     * the departing dialog in the DOM until the animation ends, so a second
     * modal opened synchronously ends up underneath it (it has its own z-index)
     * and gets a second focus trap.
     */
    afterLeave: [];
}

/**
 * Geometry of the modal header and footer:
 * - `md` — dialogs and forms (52rem and narrower);
 * - `lg` — full-screen working modals (the text editor, documentation, the media
 *   library): they have their own, larger grid of padding and title.
 *
 * Two steps rather than a prop per value: the header used to be written in
 * fifteen places with seven different paddings and four title sizes.
 */
export type TBricksModalSectionSize = 'md' | 'lg';

export interface IBricksModalHeaderProps {
    size?: TBricksModalSectionSize;
    /** Separate the header from the body with a line */
    bordered?: boolean;
    /** Blocks the close button while a submit is running and closing is not allowed */
    closeDisabled?: boolean;
}

export interface IBricksModalHeaderEmits {
    close: [];
}

/**
 * Footer layout:
 * - `bar` — an action strip separated by a line, with its own padding;
 * - `plain` — the same strip without the line (the modal body reads as separate
 *   even without it);
 * - `inline` — the footer stands INSIDE a form or a body whose padding already
 *   applies, and only adds a gap above itself.
 */
export type TBricksModalFooterVariant = 'bar' | 'plain' | 'inline';

export interface IBricksModalFooterProps {
    size?: TBricksModalSectionSize;
    variant?: TBricksModalFooterVariant;
}
