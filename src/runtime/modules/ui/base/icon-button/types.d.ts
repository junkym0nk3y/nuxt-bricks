/**
 * The surface the button stands on: border, background and glyph color all
 * depend on it.
 *
 * `outlined` — a border on a light background (list rows, cards, editor tools);
 * `ghost` — borderless, inside a dense panel where the borders of its neighbors
 * already draw the grid; `quiet` — a raised borderless plate (the builder
 * toolbar, where the button has to read against the panel's own background);
 * `overlay` — a white glyph over a dark veil on a thumbnail. Its color is static
 * in both themes: `base-900` would turn almost white on almost white in the dark
 * theme. Its glyph is also larger than the rest — the veil covers a page
 * thumbnail, and against that `1.4rem` gets lost.
 */
export type TBricksIconButtonVariant = 'outlined' | 'ghost' | 'quiet' | 'overlay';

/**
 * Side of the square: `sm` 20 (a close button inside a chip or a tab), `md` 28,
 * `lg` 32 (action rows and panels), `xl` 40 (the toolbar — there the button
 * stands alone and larger than its row neighbors).
 */
export type TBricksIconButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export type TBricksIconButtonTooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface IBricksIconButtonProps {
    /** Glyph key for `BricksIcon` */
    icon: string;
    /**
     * Accessible name and tooltip text. Required: a single glyph does not imply
     * what the button does, neither for a screen reader nor for the eye.
     */
    label: string;
    /**
     * Tooltip text when it differs from the name: on a blocked button the hint
     * explains the REASON for the block, while the button's name stays the
     * action itself.
     */
    hint?: string;
    variant?: TBricksIconButtonVariant;
    size?: TBricksIconButtonSize;
    /** Destructive action: deletion, disabling */
    danger?: boolean;
    /**
     * Toggle state. Left unset, the button is not a toggle and gets no
     * `aria-pressed` at all — otherwise a screen reader would announce every
     * ordinary action as pressable.
     */
    active?: boolean;
    /** Plain block: the button leaves the keyboard tab order */
    disabled?: boolean;
    /**
     * Block with a reason: the button stays focusable, is announced via
     * `aria-disabled`, and the handler swallows the click. Needed where the
     * reason for the block has to be readable by a person — a disabled button
     * would take it away with itself. Visually it dims exactly like `disabled`:
     * two different opacities would not tell them apart anyway, and the reason is
     * what the hint explains.
     */
    muted?: boolean;
    /** An operation is running on the button: a waiting cursor, not a refusal one */
    busy?: boolean;
    /**
     * The button opens a popover or a menu: the value goes into `aria-expanded`,
     * and the button itself is announced as `aria-haspopup`. Left unset, the
     * button opens nothing and gets no such attributes at all — otherwise a
     * screen reader would announce every ordinary action as expanding.
     */
    expanded?: boolean;
    tooltipSide?: TBricksIconButtonTooltipSide;
    /**
     * Place in the tab order, for a button that lives inside a container with a
     * roving tab stop: there only the active cell may be reachable by Tab, and
     * everything inside the rest of the cells is taken out of it.
     *
     * A prop rather than a plain attribute because outer attributes land on the
     * tooltip WRAPPER, not on the button — a `tabindex` written from the outside
     * would never reach the control it is meant for.
     *
     * The two values are the whole model: 0 for the button of the active cell,
     * -1 for the rest. A positive index would put the button ahead of the
     * document order, which no place in the builder has a reason to do.
     */
    tabIndex?: 0 | -1;
}

export interface IBricksIconButtonEmits {
    click: [event: MouseEvent];
}
