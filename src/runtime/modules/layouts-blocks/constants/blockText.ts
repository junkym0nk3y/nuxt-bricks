/**
 * Font sizes of the Text block.
 */

/** Base size: what the widest `@container` query used to give */
export const BLOCK_TEXT_BASE_FONT_SIZE = 1.8;

/**
 * Sizes of the former layout, under the canonical device keys.
 *
 * Before the move to CSS variables the size was set by `@container` queries right in
 * the SFC: 1.4rem up to 768, 1.6rem up to 1024, 1.8rem beyond. Existing schemas have
 * no `fontSize` property, and without this table all of their text on narrow devices
 * would jump to the base size — a silent change to every page at once.
 *
 * For schemas without a `fontSize` of their own only: as soon as the user sets the size
 * explicitly, their values and their overrides take effect.
 */
export const BLOCK_TEXT_LEGACY_FONT_SIZES: Record<string, number> = {
    mobile: 1.4,
    tablet: 1.6,
};
