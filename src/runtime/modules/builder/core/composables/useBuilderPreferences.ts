// #region Imports
// Types
import type { IUseBuilderPreferencesReturn } from '../types/preferences';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useCookie, useRuntimeConfig } from '#imports';

// Constants
import { DARK_MODE_COOKIE, DARK_MODE_COOKIE_MAX_AGE } from '../constants/theme';
import { BUILDER_LOCALE_COOKIE, BUILDER_LOCALE_COOKIE_MAX_AGE } from '../constants/locale';
// #endregion

/**
 * The shell preferences of the builder: the theme of the interface and the
 * language. Shared by both surfaces that carry a shell — the dashboard and the
 * editor — because they write the same cookie: two implementations of it drifted
 * apart once already (the editor kept a local flag next to the cookie, so a value
 * written on the other surface was ignored until a reload).
 *
 * Why the theme is kept in a cookie and why that cookie is shared — next to the
 * constant itself (`core/constants/theme`).
 *
 * @returns The dark theme flag, the `body` class and the switches.
 */
export function useBuilderPreferences(): IUseBuilderPreferencesReturn {
    // #region Data
    const { locale, setLocale } = useI18n();

    /**
     * The path of both cookies is the application's base rather than the domain root: an
     * application mounted under a prefix next to another site would otherwise send them
     * with every request to that site. The builder and the preview both live under the
     * base, so each of them still reads the same choice.
     */
    const cookiePath = useRuntimeConfig().app.baseURL || '/';

    const darkModeCookie = useCookie<boolean>(DARK_MODE_COOKIE, {
        default: () => false,
        maxAge: DARK_MODE_COOKIE_MAX_AGE,
        path: cookiePath,
    });

    /**
     * No `default` here: a cookie with one is written into the response even when
     * nobody has chosen anything.
     */
    const localeCookie = useCookie<string | null>(BUILDER_LOCALE_COOKIE, {
        maxAge: BUILDER_LOCALE_COOKIE_MAX_AGE,
        path: cookiePath,
        sameSite: 'lax',
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
     * Switches the locale of the interface (ru to en and back) and remembers the
     * choice: the cookie is the one source the builder routes read the language from
     * (plugins/builder-locale).
     */
    async function toggleLocale(): Promise<void> {
        const next = locale.value === 'ru' ? 'en' : 'ru';

        localeCookie.value = next;
        await setLocale(next);
    }
    // #endregion

    return { isDarkMode, bodyClass, toggleDarkMode, toggleLocale };
}
