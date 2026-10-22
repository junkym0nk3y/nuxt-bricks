// #region Imports
// Nuxt
import { defineNuxtPlugin } from '#imports';

// Composables
import { useBricksDevices } from '../modules/common/composables/useBricksDevices';
import { useBricksStyles } from '../modules/common/composables/useBricksStyles';
import { useResponsiveVisibilityStyles } from '../modules/layouts-blocks/composables/useResponsiveVisibilityStyles';
import { useResponsiveLayoutStyles } from '../modules/layouts-blocks/composables/useResponsiveLayoutStyles';
// #endregion

/**
 * Auto-initialization of the bricks styles: injects the dynamic CSS (SSR-safe).
 *
 * It writes the CSS of the PROJECT set: that is the SSR default, and it covers any
 * consumer page where bricks content is rendered. How a page with a set of its own
 * (`page.viewportConfig`) displaces these entries is described at each of the three
 * composables below.
 */
export default defineNuxtPlugin(() => {
    const { projectDevices } = useBricksDevices();
    const getDevices = () => projectDevices;

    useBricksStyles(getDevices);
    useResponsiveVisibilityStyles(getDevices);
    useResponsiveLayoutStyles(getDevices);
});
