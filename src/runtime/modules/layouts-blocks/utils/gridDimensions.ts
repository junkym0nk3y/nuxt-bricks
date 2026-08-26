/**
 * The declared capacity of a Grid block on a concrete viewport.
 *
 * Both dimensions have responsive overrides, so the number of cells is a property
 * of a CONCRETE viewport — a Grid of 2 cells on mobile and of 8 on desktop is one
 * and the same block. Normalizing the track counts themselves is pure and lives in
 * `gridTracks.ts`; this file reads the registry and therefore cannot be imported
 * by a block definition.
 */

// #region Imports
// Types
import type { IBricksComponent, TBricksDeviceKey } from '../../common/types/brick';

// Utils
import { normalizeGridTrackCount } from './gridTracks';
import { resolveBlockProps } from '../registry';
// #endregion

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
