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

/** Converts a value from pixels into the given unit */
export function convertFromPx(px: number, unit: TSizeUnit, emPixelSize: number): number {
    switch (unit) {
        case 'rem':
            return px / PX_PER_REM;
        case 'em':
            return px / emPixelSize;
        default:
            return px;
    }
}

/** Rounds a number to the given number of decimal places */
export function roundDecimal(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
