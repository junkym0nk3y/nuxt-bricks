// #region Imports
// Types
import type { ComponentLibraryItem } from '../../common/types/brick';

// Utils
import { getLayoutLibraryItems } from '../../layouts-blocks/registry';
// #endregion

/**
 * Предустановленные layout-компоненты библиотеки билдера.
 * Wrapper над registry (шаг B3): метаданные и дефолты derive'ятся
 * из definitions в layouts-blocks (single source of truth).
 */
export const LAYOUT_COMPONENTS: ComponentLibraryItem[] = getLayoutLibraryItems();
