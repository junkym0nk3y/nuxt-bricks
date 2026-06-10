// #region Imports
// Nuxt
import { defineNuxtPlugin } from '#imports';

// Composables
import { useLandingStyles } from '../modules/common/composables/useLandingStyles';
import { useResponsiveVisibilityStyles } from '../modules/layouts-blocks/composables/useResponsiveVisibilityStyles';
import { useResponsiveLayoutStyles } from '../modules/layouts-blocks/composables/useResponsiveLayoutStyles';
// #endregion

/**
 * Plugin for auto-initialization of landing styles
 * Injects dynamic CSS (SSR-safe)
 */
export default defineNuxtPlugin(() => {
    useLandingStyles();
    useResponsiveVisibilityStyles();
    useResponsiveLayoutStyles();
});
