/**
 * Types of the shell preferences of the builder (the theme and the language).
 */

import type { ComputedRef } from 'vue';

/**
 * The return value of `useBuilderPreferences`.
 */
export interface IUseBuilderPreferencesReturn {
    isDarkMode: ComputedRef<boolean>;
    /** The `body` class of the surface: carries `bricks-dark` under the dark theme */
    bodyClass: ComputedRef<string>;
    toggleDarkMode: () => void;
    toggleLocale: () => Promise<void>;
}
