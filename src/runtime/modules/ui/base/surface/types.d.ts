/** Card radius: `sm` for a list row and a template card, `md` for a library tile */
export type TBricksSurfaceCardRadius = 'sm' | 'md';

/** Shadow step on hover and on `selected`; otherwise the card carries no shadow */
export type TBricksSurfaceCardElevation = 'sm' | 'md';

/**
 * Root tag. A list row and a template card are `article`: each has its own name
 * and its own actions, which makes it a self-contained unit of content rather
 * than a layout block. Swapping them for `div` for the sake of a shared
 * component would mean paying with semantics for styling.
 */
export type TBricksSurfaceCardTag = 'div' | 'article';

export interface IBricksSurfaceCardProps {
    as?: TBricksSurfaceCardTag;
    radius?: TBricksSurfaceCardRadius;
    /**
     * The card responds to hover and to focus inside it: border and shadow.
     * This is about RESPONSE, not about being clickable — an account row lights
     * up to reveal its buttons, but leads nowhere itself.
     *
     * Hover and inner focus are one and the same state: actions on a row appear
     * on hover, and without `focus-within` they would stay invisible to anyone
     * walking the page with the keyboard.
     */
    interactive?: boolean;
    /**
     * The card has a click action — the cursor must say so. Kept separate from
     * `interactive`: `cursor: pointer` on a card without a handler promises a
     * navigation that will not happen.
     */
    clickable?: boolean;
    elevation?: TBricksSurfaceCardElevation;
    /**
     * A selected card keeps the hover look permanently: otherwise, once the
     * cursor leaves, the only reminder of the selection is the content of the
     * panel next to it.
     */
    selected?: boolean;
}
