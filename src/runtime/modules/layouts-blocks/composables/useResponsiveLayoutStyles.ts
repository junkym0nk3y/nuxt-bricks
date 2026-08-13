// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../../common/types/devices';

// Nuxt
import { useHead } from 'nuxt/app';

// Utils
import { buildResponsiveLayoutCss } from '../utils/responsiveCss';
// #endregion

/** Ключ тега: по нему набор страницы вытесняет проектный. */
const BRICKS_LAYOUT_STYLE_KEY = 'bricks-responsive-layout';

/**
 * Инжектит глобальные CSS-правила для responsive layout-настроек через CSS variables.
 *
 * В схеме layout-компоненты хранят `props.responsive[<ключ устройства>]` с
 * overrides. Рендерер выставляет базовые переменные (`--bricks-grid-columns-base`)
 * и переменные тех устройств, у которых override реально есть; здесь мы только
 * выбираем активную переменную в зависимости от текущего устройства канваса или
 * диапазона окна.
 *
 * Правила генерируются из `responsiveCssVars` definitions блоков.
 * Реализация SSR-safe: никаких JS device detection, только CSS.
 *
 * Геттер, а не значение: набор страницы меняется без перемонтирования
 * (см. `useBricksStyles`).
 *
 * @param getDevices - Геттер резолвнутого набора устройств.
 */
export function useResponsiveLayoutStyles(getDevices: () => TBricksResolvedDeviceSet): void {
    useHead(() => ({
        style: [
            {
                key: BRICKS_LAYOUT_STYLE_KEY,
                tagDuplicateStrategy: 'replace',
                innerHTML: buildResponsiveLayoutCss(getDevices()),
            },
        ],
    }));
}
