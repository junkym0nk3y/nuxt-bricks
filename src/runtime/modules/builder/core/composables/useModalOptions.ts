// #region Imports
// Types
import type { TModalKey, IModalOption, TCachedModal } from '../types/modals';

// Utils
import { translateBricksKey } from '../../../common/utils/globalI18n';
// #endregion

// #region Data
/** Locale key of the "no modal" option of the picker */
const MODAL_DISABLED_KEY = 'bricks.properties.modalDisabled';

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
    return [
        // Outside a setup context, so the translation goes through the shared helper:
        // it resolves $i18n lazily and answers with the key when there is none — a raw
        // key reads as the configuration mistake it is, while a literal would show one
        // chosen language to everyone
        { label: translateBricksKey(MODAL_DISABLED_KEY), value: null },
        ...modalsCache.map((modal) => ({
            label: modal.name,
            value: modal.name as TModalKey,
        })),
    ];
}
