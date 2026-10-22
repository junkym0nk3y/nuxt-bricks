// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../../common/types/devices';

// Nuxt
import { useHead } from 'nuxt/app';

// Utils
import { buildResponsiveLayoutCss } from '../utils/responsiveCss';
// #endregion

/** Tag key: it is how the page device set displaces the project one */
const BRICKS_LAYOUT_STYLE_KEY = 'bricks-responsive-layout';

/**
 * Injects the global CSS rules of the responsive layout settings through CSS variables.
 *
 * In the schema, layout components keep their overrides in
 * `props.responsive[<device key>]`. The renderer emits the base variables
 * (`--bricks-grid-columns-base`) plus the variables of the devices that really do carry
 * an override; all that happens here is picking the active variable depending on the
 * current canvas device or on the window range.
 *
 * The rules are generated from the `responsiveCssVars` of the block definitions.
 * The implementation is SSR-safe: no JS device detection, CSS only.
 *
 * A getter rather than a value: the page device set changes without a remount (see
 * `useBricksStyles`).
 *
 * @param getDevices - Getter of the resolved device set.
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
