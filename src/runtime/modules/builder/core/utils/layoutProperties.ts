// #region Imports
// Types
import type { ILayoutProperty } from '../../../common/types/layoutProperty';

// Utils
import { getBlockProperties } from '../../../layouts-blocks/registry';
// #endregion

/**
 * Reads the editor properties of one layout block out of `layouts-blocks/registry`.
 *
 * @param layoutName - Block name, case-insensitive ('Grid' or 'grid').
 * @returns Property definitions of that block.
 */
export function getLayoutProperties(layoutName: string): ILayoutProperty[] {
    return getBlockProperties(layoutName);
}
