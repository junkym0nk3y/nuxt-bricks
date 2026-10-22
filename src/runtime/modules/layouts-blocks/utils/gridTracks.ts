/**
 * Track math of a Grid block, shared by the canvas SFC and the definition.
 *
 * Separate from `gridDimensions.ts` on purpose: counting the cells of a viewport needs
 * the block registry, the registry imports every definition, and a definition reaching
 * back for the registry through a util closes an import cycle. What lives here stays
 * pure, so both surfaces can read it.
 */

/**
 * Normalizes the declared number of tracks (rows or columns) into a whole number
 * of at least one.
 *
 * The value arrives from a schema and is untrusted: zero, a negative number, a fraction
 * and a missing value all have to fold into one track rather than into an invalid CSS
 * template such as `repeat(2.7, auto)`.
 *
 * @param value - Value of the block property.
 * @returns The number of tracks, at least 1.
 */
export function normalizeGridTrackCount(value: number | undefined): number {
    if (!value || value < 1) {
        return 1;
    }

    return Math.floor(value);
}
