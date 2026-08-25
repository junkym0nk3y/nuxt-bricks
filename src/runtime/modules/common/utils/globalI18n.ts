// #region Imports
// Types
import type { Composer } from 'vue-i18n';

// Nuxt
import { useNuxtApp } from '#imports';
// #endregion

/**
 * Translates a key through the global i18n — for the code that has no setup context of
 * its own: the stores, the utilities they call, and the surfaces that run both with
 * and without the i18n plugin (the published render among them, where it is never
 * installed at all).
 *
 * `$i18n` is resolved lazily on every call, so no order of the plugins can break it, and
 * a missing instance gives the key back instead of throwing: a raw key on screen is a
 * defect one can see, an exception is a screen one cannot. For the same reason there is
 * no fallback string parameter — a literal would show one chosen language to everyone.
 *
 * The same helper stood copied in two stores of the media domain, JSDoc included.
 *
 * @param key - Translation key.
 * @param params - Interpolation values of the message, when it has placeholders.
 * @returns The translation, or the key itself when i18n is not there.
 */
export function translateBricksKey(key: string, params?: Record<string, unknown>): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;

    if (!i18n) {
        return key;
    }

    return params ? i18n.t(key, params) : i18n.t(key);
}
