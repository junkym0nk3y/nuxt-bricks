/**
 * Constants of the Slider block.
 */

/** Default number of slides on the base device */
export const DEFAULT_SLIDES_PER_VIEW = 3;

/**
 * Default gap between slides, in pixels.
 *
 * Shared by the published render, by the component and by the declared default of the
 * property: the value travels two ways at once — a CSS variable for the static markup
 * and a JS breakpoint for Swiper — and two copies of the fallback would drift apart on
 * the first change.
 *
 * The stylesheet of the block repeats the number as a literal (`var(…, 16px)`): a
 * `<style>` block cannot import a constant, and the fallback there only fires when the
 * generated table is absent altogether.
 */
export const DEFAULT_SLIDER_SPACE_BETWEEN = 16;
