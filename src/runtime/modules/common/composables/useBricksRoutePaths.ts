// #region Imports
// Types
import type { IUseBricksRoutePathsReturn } from '../types/composables';
import type { IBricksPageAddress } from '../types/pageAddress';

// Utils
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBuilderLoginPath,
    getPreviewPagePath,
    isBuilderPath,
    joinPathBase,
    stripPathBase,
    type IBricksRoutePrefixes,
} from '../utils/bricks/routePaths';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

/**
 * Paths of the bricks surfaces, honoring `bricks.routes` and `app.baseURL`.
 *
 * For navigation inside Vue Router the named routes are preferable
 * (`bricks-builder-index`, `bricks-builder-pagename`, `bricks-preview`) — they depend
 * on neither the prefixes nor the base. The composable is for the places that need a
 * path as a string: `window.location`, `window.open`, `<a href>`, a comparison with
 * `location.pathname`.
 */
export function useBricksRoutePaths(): IUseBricksRoutePathsReturn {
    const config = useRuntimeConfig();
    const prefixes =
        (config.public.bricksRoutes as IBricksRoutePrefixes | undefined) ??
        DEFAULT_BRICKS_ROUTE_PREFIXES;
    const baseURL = (config.app?.baseURL as string | undefined) || '/';

    return {
        prefixes,
        builderRootPath: prefixes.builderPrefix,
        builderLoginPath: getBuilderLoginPath(prefixes),
        previewPagePath: (address: IBricksPageAddress, versionId?: number) =>
            getPreviewPagePath(prefixes, address, versionId),
        withBase: (path: string) => joinPathBase(baseURL, path),
        stripBase: (pathname: string) => stripPathBase(pathname, baseURL),
        isBuilderPath: (pathname: string) => isBuilderPath(prefixes, pathname),
    };
}
