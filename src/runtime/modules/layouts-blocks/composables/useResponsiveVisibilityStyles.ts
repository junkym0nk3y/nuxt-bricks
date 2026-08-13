// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../../common/types/devices';

// Nuxt
import { useHead } from 'nuxt/app';

// Utils
import { buildDeviceVisibilityCss } from '../utils/deviceVisibilityCss';
// #endregion

/** Ключ тега: по нему набор страницы вытесняет проектный. */
const BRICKS_VISIBILITY_STYLE_KEY = 'bricks-responsive-visibility';

/**
 * Инжектит глобальные CSS-правила для скрытия элементов по устройствам.
 *
 * Две ветки: канвас ориентируется на `data-bricks-viewport`, published — на
 * диапазоны набора. Реализация SSR-safe: правила задаются через CSS, без JS
 * device detection.
 *
 * Геттер, а не значение: набор страницы меняется без перемонтирования
 * (см. `useBricksStyles`).
 *
 * @param getDevices - Геттер резолвнутого набора устройств.
 */
export function useResponsiveVisibilityStyles(getDevices: () => TBricksResolvedDeviceSet): void {
    useHead(() => ({
        style: [
            {
                key: BRICKS_VISIBILITY_STYLE_KEY,
                tagDuplicateStrategy: 'replace',
                innerHTML: buildDeviceVisibilityCss(getDevices()),
            },
        ],
    }));
}
