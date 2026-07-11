// #region Imports
// Utils
import { resolveBricksAssetUrl } from '../utils/bricks/assetPaths';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

/**
 * Возвращаемое значение `useBricksAssetUrl`.
 */
export interface IUseBricksAssetUrlReturn {
    /** `app.baseURL` приложения (`/` без конфигурации). */
    baseURL: string;
    /** URL публичного ассета модуля (`/_bricks/...`) с учётом `app.baseURL`. */
    resolveAssetUrl: (assetPath: string) => string;
}

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
