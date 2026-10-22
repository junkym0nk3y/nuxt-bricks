/**
 * Constants of the Grid block.
 */

/**
 * Minimum height of a grid container, the same on the canvas and on a published page.
 *
 * A grid declares its structure through the track template, and an empty template
 * paints nothing: without a floor a grid with no content collapses to zero height and
 * there is nowhere to drop the first component. Published keeps the same floor so that
 * a page does not reflow the moment the last child is removed.
 */
export const BLOCK_GRID_MIN_HEIGHT = '10rem';
