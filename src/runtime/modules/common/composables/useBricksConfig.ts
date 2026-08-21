// #region Imports
// Types
import type { IAppConfig } from '../types/config';
import type { IUseBricksConfigReturn } from '../types/composables';

// Nuxt
import { useAppConfig } from 'nuxt/app';
// #endregion

/**
 * Composable for the landing configuration with its default values.
 * Reads the configuration out of app.config.ts and returns the defaults for whatever
 * is not stated.
 *
 * The device set is no longer part of it: the set is fixed at build time by the
 * `bricks.devices` module option, because the same numbers feed the SCSS map of the
 * mixins, and a runtime knob in app.config does not reach them by the time they are
 * built. For the set there is `useBricksDevices`.
 */
export function useBricksConfig(): IUseBricksConfigReturn {
    const appConfig = useAppConfig() as IAppConfig;

    return {
        defaultFont: appConfig.bricks?.defaultFont ?? 'Inter, sans-serif',
        fonts: appConfig.bricks?.fonts,
        backgroundColor: appConfig.bricks?.backgroundColor ?? '#FFFFFF',
        layouts: appConfig.bricks?.layouts ?? [],
    };
}
