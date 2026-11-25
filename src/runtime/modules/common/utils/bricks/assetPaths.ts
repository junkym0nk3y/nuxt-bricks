/**
 * The single source of the URLs of the module's public assets (the previews of the
 * layout blocks, the image placeholder, the documentation pictures).
 *
 * The assets are served by Nitro under the dedicated `/_bricks/` prefix (publicAssets
 * in module.ts — the consumer's folders are not shadowed), and under a non-root
 * `app.baseURL` they honor it. Hardcoded `/images/...` is forbidden in new code —
 * these helpers only.
 */

// #region Imports
// Utils
import { joinPathBase } from './routePaths';
// #endregion

/** Prefix of the module's public assets (without `app.baseURL`) */
export const BRICKS_PUBLIC_ASSETS_BASE = '/_bricks/';

/** Absolute (external/protocol-relative/data:) URLs are not our assets */
const EXTERNAL_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Builds the URL of a public asset of the module, honoring `app.baseURL`.
 * Absolute external URLs are returned as they are.
 *
 * @param baseURL - The application's `app.baseURL` (`/` — no-op).
 * @param assetPath - Path of the asset inside the module's `public/` (the leading `/` is optional).
 */
export function resolveBricksAssetUrl(baseURL: string, assetPath: string): string {
    if (EXTERNAL_URL_PATTERN.test(assetPath)) {
        return assetPath;
    }

    const normalized = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;

    return joinPathBase(baseURL, `${BRICKS_PUBLIC_ASSETS_BASE}${normalized}`);
}

/**
 * Builds the URL of a file from the consumer `public/` (a brick library thumbnail),
 * honoring `app.baseURL`. Absolute external URLs are returned as they are.
 *
 * Not `resolveBricksAssetUrl`: that one points into the module's own assets under
 * `/_bricks/`, while this path belongs to the application — `/previews/Card.webp`
 * under `app.baseURL: '/landings/'` is served at `/landings/previews/Card.webp`.
 *
 * @param baseURL - The application's `app.baseURL` (`/` — no-op).
 * @param publicPath - Path from the root of the consumer `public/`, with a leading `/`.
 */
export function resolveAppPublicUrl(baseURL: string, publicPath: string): string {
    if (EXTERNAL_URL_PATTERN.test(publicPath)) {
        return publicPath;
    }

    return joinPathBase(baseURL, publicPath.startsWith('/') ? publicPath : `/${publicPath}`);
}
