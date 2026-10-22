// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../types/devices';

// Nuxt
import { useHead } from 'nuxt/app';

// Utils
import { buildBricksContainerCss } from '../utils/bricks/containerCss';
// #endregion

/** Key of the tag: the page set displaces the project one by it */
const BRICKS_CONTAINER_STYLE_KEY = 'bricks-container';

/**
 * Injection of the container styles into the `<head>`.
 *
 * The tag is marked with a fixed `key` and `tagDuplicateStrategy: 'replace'`: the
 * plugin writes the CSS of the PROJECT set, while a page with a set of its own
 * registers an entry later and displaces it by the same key. Leaving the page removes
 * the entry and the project CSS comes back. Without a `key` there would be no
 * deduplication at all — both tags would end up in the `<head>` and the layout would
 * be decided by their order.
 *
 * The argument is a getter rather than a value: the page set changes without a
 * remount (an edit in the modal, the live preview, a navigation between builder
 * pages), and a one-off call would leave the CSS of the first page that was opened.
 *
 * @param getDevices - Getter of the resolved device set.
 */
export function useBricksStyles(getDevices: () => TBricksResolvedDeviceSet): void {
    useHead(() => ({
        style: [
            {
                key: BRICKS_CONTAINER_STYLE_KEY,
                tagDuplicateStrategy: 'replace',
                innerHTML: buildBricksContainerCss(getDevices()),
            },
        ],
    }));
}
