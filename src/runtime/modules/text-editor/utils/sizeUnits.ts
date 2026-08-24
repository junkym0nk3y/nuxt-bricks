/**
 * Pure size conversions for TipTap media nodes (px/rem/em/%).
 * The px equivalent of 1em depends on the computed font-size of the element, so it
 * comes in as a parameter.
 */

export const SIZE_UNITS = ['px', 'rem', 'em', '%'] as const;

export type TSizeUnit = (typeof SIZE_UNITS)[number];

const PX_PER_REM = 10;
export const DEFAULT_PX_PER_EM = 16;

/** Parses a string such as "10rem" into a number and a unit */
export function parseCustomDimension(value: string): { value: number; unit: TSizeUnit } | null {
    const match = value.match(/^(\d+(?:\.\d+)?)(rem|em|%|px)$/);
    if (!match) {
        return null;
    }
    return { value: parseFloat(match[1]), unit: match[2] as TSizeUnit };
}

/**
 * Converts a value into pixels for ResizableNodeView.
 * Returns 0 for px/% — no pixel equivalent is computed for those.
 */
export function convertToPx(value: number, unit: TSizeUnit, emPixelSize: number): number {
    switch (unit) {
        case 'rem':
            return Math.round(value * PX_PER_REM);
        case 'em':
            return Math.round(value * emPixelSize);
        default:
            return 0;
    }
}

/**
 * Converts a value from pixels into the given unit.
 *
 * A percentage is resolved against the width of the containing block, which is why it
 * comes in as a parameter as well: without it the pixel count used to be written out as
 * the percentage itself, and an image 300 px wide reached the DOM as `width: 300%`. An
 * unknown base answers 100% rather than 0: the full width of the container is capped by
 * the `max-width: 100%` the node view sets, whereas zero would make the media vanish.
 *
 * @param px - The value in pixels.
 * @param unit - The unit to convert into.
 * @param emPixelSize - The pixel equivalent of 1em for the element.
 * @param percentBasePx - The width of the containing block, 0 when it cannot be read.
 */
export function convertFromPx(
    px: number,
    unit: TSizeUnit,
    emPixelSize: number,
    percentBasePx = 0
): number {
    switch (unit) {
        case 'rem':
            return px / PX_PER_REM;
        case 'em':
            return px / emPixelSize;
        case '%':
            return percentBasePx > 0 ? Math.min((px / percentBasePx) * 100, 100) : 100;
        default:
            return px;
    }
}

/** Rounds a number to the given number of decimal places */
export function roundDecimal(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
