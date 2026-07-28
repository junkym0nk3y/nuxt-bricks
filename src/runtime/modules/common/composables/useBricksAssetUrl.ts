// #region Imports
// Types
import type { IUseBricksAssetUrlReturn } from '../types/composables';

// Utils
import { resolveBricksAssetUrl } from '../utils/bricks/assetPaths';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

/**
 * URL публичных ассетов модуля с учётом `app.baseURL`
 * (паттерн `useBricksRoutePaths.withBase`).
 */
export function useBricksAssetUrl(): IUseBricksAssetUrlReturn {
    const config = useRuntimeConfig();
    const baseURL = (config.app?.baseURL as string | undefined) || '/';

    return {
        baseURL,
        resolveAssetUrl: (assetPath: string) => resolveBricksAssetUrl(baseURL, assetPath),
    };
}
