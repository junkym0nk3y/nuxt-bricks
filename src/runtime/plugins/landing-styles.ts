// #region Imports
// Nuxt
import { defineNuxtPlugin } from '#imports';

// Composables
import { useLandingStyles } from '../composables/useLandingStyles';
import { useLandingResponsiveVisibilityStyles } from '../composables/useLandingResponsiveVisibilityStyles';
import { useLandingResponsiveLayoutStyles } from '../composables/useLandingResponsiveLayoutStyles';
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
