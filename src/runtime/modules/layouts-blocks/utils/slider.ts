/**
 * Utilities of the Slider block, shared by the SFC and the definition.
 */

/**
 * Brings a `slidesPerView` value to a positive number (no less than 1).
 *
 * @param value - Value out of the schema or out of a device override.
 * @returns Number of slides, no less than one.
 */
export function normalizeSlidesPerView(value: unknown): number {
    return Math.max(1, Number(value) || 1);
}
