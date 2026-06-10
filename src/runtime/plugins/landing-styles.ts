// #region Imports
// Nuxt
import { defineNuxtPlugin } from '#imports';

// Composables
import { useLandingStyles } from '../composables/useLandingStyles';
import { useLandingResponsiveVisibilityStyles } from '../layouts-blocks/composables/useLandingResponsiveVisibilityStyles';
import { useLandingResponsiveLayoutStyles } from '../layouts-blocks/composables/useLandingResponsiveLayoutStyles';
// #endregion

/**
 * Plugin for auto-initialization of landing styles
 * Injects dynamic CSS (SSR-safe)
 */
export default defineNuxtPlugin(() => {
    useLandingStyles();
    useLandingResponsiveVisibilityStyles();
    useLandingResponsiveLayoutStyles();
});
