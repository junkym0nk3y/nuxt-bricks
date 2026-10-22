// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';

// Utils
import { getLayoutLibraryItems } from '../../../layouts-blocks/registry';
// #endregion

/**
 * Preset layout components of the builder library: metadata and defaults derived from
 * the block definitions by `layouts-blocks/registry.getLayoutLibraryItems`.
 */
export const LAYOUT_COMPONENTS: IComponentLibraryItem[] = getLayoutLibraryItems();
