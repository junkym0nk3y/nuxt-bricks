/**
 * Badge tone. The set is assembled from what had already been written by hand in
 * five places:
 * - `primary` — `primary` fill with a white caption (current page version,
 *   selected media library file, role in the profile);
 * - `neutral` — `base-200`/`base-600`: the quiet counterpart of `primary` for a
 *   badge that has no caller of its own right now (the keyword chip and the
 *   draft marker, which the set was assembled from, ended up on `primary` and
 *   `muted`);
 * - `muted` — `base-100`/`base-600`: a quiet caption next to a name ("you") and
 *   the editor role. The `base-500` caption the "you" badge lived with before it
 *   moved into the kit gave 4.4:1 on `base-100` — below the AA threshold for
 *   regular text, and as a kit tone that would have spread to everyone;
 * - `accent` — `primary-50`/`primary-600`, a highlighted value without a
 *   full-tone fill (administrator role);
 * - `quiet` — `base-50`/`base-500` with a border: a value that needs no emphasis
 *   at all (viewer role);
 * - `plain` — no fill: a status line where the value is carried by the dot and
 *   the caption.
 */
export type TBricksBadgeTone = 'primary' | 'neutral' | 'muted' | 'accent' | 'quiet' | 'plain';

/**
 * Shape: `rounded` for a rounded rectangle, `pill` for a pill.
 *
 * The `rounded` radius is `0.4rem` as a number rather than a token: the radius
 * scale has no such value (the nearest, `--bricks-border-radius-xs`, is
 * `0.6rem`), and pulling the scale toward a single badge would mean changing
 * its look for the sake of purity.
 */
export type TBricksBadgeShape = 'rounded' | 'pill';

/**
 * Leading status dot. It is what announces a state where each place used to have
 * its own `statusDot`: the `0.8rem` circle had been written twice, and in the
 * page list the status rested on color alone — neither a screen reader nor a
 * person who cannot tell green apart received it.
 */
export type TBricksBadgeDot = 'neutral' | 'positive';

/** Root tag: a badge is sometimes a menu trigger too (the role pill in a row) */
export type TBricksBadgeTag = 'span' | 'button';

export interface IBricksBadgeProps {
    tone?: TBricksBadgeTone;
    shape?: TBricksBadgeShape;
    /** Empty string means no dot */
    dot?: TBricksBadgeDot | '';
    as?: TBricksBadgeTag;
}
