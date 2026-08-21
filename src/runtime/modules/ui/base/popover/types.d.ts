/**
 * Inner padding of the surface:
 * - `compact` (`0.4rem`) — a panel of icons only (the floating image toolbar);
 * - `default` (`0.6rem`) — menus and lists;
 * - `roomy` (`0.8rem`) — grids and panels with fields;
 * - `flush` (`0`) — the content takes care of its own padding (the page list
 *   with search and a full-width footer).
 */
export type TBricksPopoverDensity = 'compact' | 'default' | 'roomy' | 'flush';

/**
 * Shadow step. `lg` is a deliberate case: the surface floats above canvas
 * content rather than above an interface panel, and on a busy background `md`
 * gets lost.
 */
export type TBricksPopoverElevation = 'sm' | 'md' | 'lg';

/**
 * Layer in the stack:
 * - `popover` — the shared `--bricks-z-popover` scale: above the builder
 *   shell and above any modal, since a popover is always opened from something
 *   that is already on top;
 * - `local` — a local stack inside its own parent (a popover inside a modal
 *   overlaps only the neighboring rows, not the whole window);
 * - `none` — the caller owns the stack.
 *
 * A prop rather than a class from the outside: a raw `z-index` in the caller has
 * no protection against two one-off classes overlapping each other in an
 * unpredictable order.
 */
export type TBricksPopoverLayer = 'popover' | 'local' | 'none';

export interface IBricksPopoverSurfaceProps {
    density?: TBricksPopoverDensity;
    elevation?: TBricksPopoverElevation;
    layer?: TBricksPopoverLayer;
}

export interface IBricksMenuItemProps {
    /** Item caption, doubling as its accessible name */
    label: string;
    /** Leading glyph; without it the item stays aligned to the text */
    icon?: string;
    /** Value on the right: device width, shortcut, current state */
    hint?: string;
    /** The item matches the current state */
    active?: boolean;
    disabled?: boolean;
    /** Irreversible action: deletion, sign-out */
    danger?: boolean;
}

export interface IBricksMenuItemEmits {
    click: [event: MouseEvent];
}
