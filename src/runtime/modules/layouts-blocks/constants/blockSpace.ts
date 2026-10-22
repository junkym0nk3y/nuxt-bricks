/**
 * Constants of the Space block.
 */

/**
 * Default spacing, in rem.
 *
 * A number rather than a CSS length, because the same value has to serve two readers:
 * the property definition of the block and the size normalization of the published
 * render. Two literals here drift apart silently — the canvas would fall back to one
 * value and a schema without `size` to the other.
 */
export const BLOCK_SPACE_DEFAULT_SIZE = 2.4;

/** Lower bound of the spacing: a negative height is not a spacer, it is broken CSS */
export const BLOCK_SPACE_MIN_SIZE = 0;
