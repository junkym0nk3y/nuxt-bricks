/**
 * Free space kept under the content of the canvas sheet, in px.
 *
 * The sheet is never exactly as tall as its blocks: a drop after the last block needs
 * an area to aim at, and the selection outline of that block needs room to breathe.
 */
export const CANVAS_HEIGHT_BUFFER = 400;

/**
 * How long the canvas counts as switching viewports, in ms.
 *
 * It covers the `transform 250ms` move of the sheet plus the reflow that follows it:
 * the surfaces that wait for the switch (the inline editor, the scroll of the schema
 * tree) aim at the geometry that exists after the move, not during it.
 *
 * The number coincides with `CANVAS_HEIGHT_BUFFER` and means something entirely
 * different — one is a duration, the other a height in px. They are two constants for
 * that reason, and tuning one must not travel into the other.
 */
export const VIEWPORT_SWITCH_SETTLE_MS = 400;
