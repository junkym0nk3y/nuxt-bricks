// #region Imports
// Types
import type { IUsePublishDashboardPreferencesReturn } from '../types/composables';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useCookie } from '#imports';
// #endregion

// #region Data
/** The cookie of the interface theme — shared with the builder editor */
const DARK_MODE_COOKIE = 'bricks-dark-mode';

/** A year of cookie life: a person picks a theme once */
const DARK_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
// #endregion

/**
 * The settings of the dashboard shell: the theme of the interface and the
 * language.
 *
 * The theme lives in a cookie rather than in the state of the application for one
 * reason: the `bricks-dark` class is obliged to land on the `body` in the FIRST
 * frame — a cookie is read on the server, and a dark dashboard does not flash
 * light during the hydration. The cookie is shared with the editor: moving between
 * the surfaces must not switch the theme.
 *
 * @returns The dark theme flag, the `body` class and the switches.
 */
export function usePublishDashboardPreferences(): IUsePublishDashboardPreferencesReturn {
    // #region Data
    const { locale, setLocale } = useI18n();

    const darkModeCookie = useCookie<boolean>(DARK_MODE_COOKIE, {
        default: () => false,
        maxAge: DARK_MODE_COOKIE_MAX_AGE,
    });
    // #endregion

    // #region Computed
    const isDarkMode = computed<boolean>(() => darkModeCookie.value ?? false);

    /**
     * The `body` class is reactive: `useHead` reassembles the attribute on a
     * switch, and the theme applies with no reload.
     */
    const bodyClass = computed<string>(() =>
        darkModeCookie.value ? 'bricks-page bricks-dark' : 'bricks-page'
    );
    // #endregion

    // #region Methods
    /**
     * Switches the dark and the light theme of the interface.
     */
    function toggleDarkMode(): void {
        darkModeCookie.value = !darkModeCookie.value;
    }

    /**
     * Switches the locale of the interface (ru to en and back); the `bricks-locale`
     * cookie is written by i18n itself.
     */
    async function toggleLocale(): Promise<void> {
        await setLocale(locale.value === 'ru' ? 'en' : 'ru');
    }
    // #endregion

    return { isDarkMode, bodyClass, toggleDarkMode, toggleLocale };
}
