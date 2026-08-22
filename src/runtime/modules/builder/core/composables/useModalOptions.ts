// #region Imports
// Types
import type { Composer } from 'vue-i18n';
import type { TModalKey, IModalOption, TCachedModal } from '../types/modals';

// Nuxt
import { useNuxtApp } from '#imports';
// #endregion

// #region Data
/**
 * Cache of the modals from the brick component manifest. Filled from the same response
 * the library is built from (`useComponentLibrary`): requesting the same manifest a
 * second time would mean two independent caches of one response, and a failed request
 * would mean a modal picker that stays empty until the page is reloaded.
 */
let modalsCache: TCachedModal[] = [];
// #endregion

/**
 * Replaces the modal cache. Called only after the manifest has loaded successfully:
 * a failed refresh leaves the previous list in place, otherwise a network failure
 * would empty a picker that already worked.
 *
 * @param entries - Modal entries from the manifest.
 */
export function replaceModalsCache(entries: TCachedModal[]): void {
    modalsCache = entries;
}

/**
 * Reads the modal options of the picker.
 * Synchronous: it works off the preloaded cache.
 *
 * @returns Options carrying a label and a value.
 */
export function getModalOptions(): IModalOption[] {
    // Outside a setup context: $i18n is resolved lazily through useNuxtApp
    const i18n = useNuxtApp().$i18n as Composer | undefined;

    return [
        { label: i18n?.t('bricks.properties.modalDisabled') ?? 'Отключено', value: null },
        ...modalsCache.map((modal) => ({
            label: modal.name,
            value: modal.name as TModalKey,
        })),
    ];
}
