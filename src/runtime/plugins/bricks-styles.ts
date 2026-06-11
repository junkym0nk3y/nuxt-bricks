// #region Imports
// Nuxt
import { defineNuxtPlugin } from '#imports';

// Composables
import { useBricksStyles } from '../modules/common/composables/useBricksStyles';
import { useResponsiveVisibilityStyles } from '../modules/layouts-blocks/composables/useResponsiveVisibilityStyles';
import { useResponsiveLayoutStyles } from '../modules/layouts-blocks/composables/useResponsiveLayoutStyles';
// #endregion

/**
 * Plugin for auto-initialization of bricks styles
 * Injects dynamic CSS (SSR-safe)
 */
export default defineNuxtPlugin(() => {
    useBricksStyles();
    useResponsiveVisibilityStyles();
    useResponsiveLayoutStyles();
});
