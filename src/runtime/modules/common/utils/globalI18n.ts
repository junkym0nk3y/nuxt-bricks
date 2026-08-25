// #region Imports
// Types
import type { Composer } from 'vue-i18n';

// Nuxt
import { useNuxtApp } from '#imports';
// #endregion

/**
 * Translates a key through the global i18n — for the code that has no setup context of
 * its own: the stores and the utilities they call.
 *
 * `$i18n` is resolved lazily on every call, so no order of the plugins can break it, and
 * a missing instance gives the key back instead of throwing: a raw key on screen is a
 * defect one can see, an exception is a screen one cannot.
 *
 * The same helper stood copied in two stores of the media domain, JSDoc included.
 *
 * @param key - Translation key.
 * @returns The translation, or the key itself when i18n is not there.
 */
export function translateBricksKey(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;

    return i18n ? i18n.t(key) : key;
}
