/**
 * The declared dimensions of a Grid block (pure functions).
 *
 * A single place for two reasons. First, `rows`/`columns` arrive from a schema
 * and are untrusted: zero, a negative number, a fraction and a missing value all
 * have to fold into one track rather than into an invalid CSS template. Second,
 * both dimensions have responsive overrides, so the number of cells is a
 * property of a CONCRETE viewport — a Grid of 2 cells on mobile and of 8 on
 * desktop is one and the same block.
 */

// #region Imports
// Types
import type { IBricksComponent, TBricksDeviceKey } from '../../common/types/brick';

// Utils
import { resolveBlockProps } from '../registry';
// #endregion

/**
 * Normalizes the declared number of tracks (rows or columns) into a whole number
 * of at least one.
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

/**
 * The number of cells a Grid declares on the given viewport.
 *
 * The properties go through `resolveBlockProps` and not straight out of
 * `component.props`: that is where the canvas takes the responsive overrides
 * from, and reading the raw props would count the cells of the desktop while the
 * user is looking at the mobile.
 *
 * @param component - Schema component of the Grid block.
 * @param viewport - Viewport the cells are counted for.
 * @returns The number of cells (rows × columns).
 */
export function resolveGridCellCapacity(
    component: Pick<IBricksComponent, 'componentName' | 'props'>,
    viewport: TBricksDeviceKey
): number {
    const resolved = resolveBlockProps(
        component.componentName,
        (component.props ?? {}) as Record<string, unknown>,
        viewport
    );

    const rows = normalizeGridTrackCount(resolved.rows as number | undefined);
    const columns = normalizeGridTrackCount(resolved.columns as number | undefined);

    return rows * columns;
}
