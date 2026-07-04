// #region Imports
// Types
import type { ILayoutProperty } from '../../../common/types/layoutProperty';

// Utils
import { getBlockProperties } from '../../../layouts-blocks/registry';
// #endregion

/**
 * Получает конфигурацию свойств для конкретного типа layout.
 * Wrapper над registry (шаг B3): свойства живут в definitions блоков
 * в layouts-blocks (single source of truth).
 *
 * @param layoutName - Имя layout (grid, flex, space, text, media, accordion).
 * @returns Массив определений свойств для типа layout.
 */
export function getLayoutProperties(layoutName: string): ILayoutProperty[] {
    return getBlockProperties(layoutName);
}
