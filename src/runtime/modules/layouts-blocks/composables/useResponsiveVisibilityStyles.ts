// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../../common/types/devices';

// Nuxt
import { useHead } from 'nuxt/app';

// Utils
import { buildDeviceVisibilityCss } from '../utils/deviceVisibilityCss';
// #endregion

/** Tag key: it is how the page device set displaces the project one */
const BRICKS_VISIBILITY_STYLE_KEY = 'bricks-responsive-visibility';

/**
 * Injects the global CSS rules that hide elements per device.
 *
 * Two branches: the canvas keys off `data-bricks-viewport`, a published page off the
 * ranges of the set. The implementation is SSR-safe: the rules are expressed in CSS,
 * with no JS device detection.
 *
 * A getter rather than a value: the page device set changes without a remount (see
 * `useBricksStyles`).
 *
 * @param getDevices - Getter of the resolved device set.
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
