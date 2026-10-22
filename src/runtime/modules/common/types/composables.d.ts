/**
 * Return values of the composables of the `common` domain.
 */

import type { IBrickExportModule } from './index';
import type { IBricksDeviceRange, IBricksPageDevice, TBricksResolvedDeviceSet } from './devices';
import type { IBricksPageAddress } from './pageAddress';
import type { IBricksRoutePrefixes } from '../utils/bricks/routePaths';
import type { CLIENT_OWNED_REQUEST_OPTIONS } from '../utils/apiRequestPolicy';

// #region useApiClient
/**
 * The ofetch instance the builder client is built on. The type is taken from
 * `globalThis.$fetch.create` so that the shape of the options cannot drift away
 * from the transport.
 */
type TRawApiFetcher = ReturnType<typeof globalThis.$fetch.create>;

/**
 * Options of a single request of the builder client — without the transport
 * policy: the hooks and the retries. The caller describes the request (method,
 * body, headers, ceiling, signal), while the address, the identity and the retry
 * policy stay with the client.
 *
 * The subtracted keys come from `CLIENT_OWNED_REQUEST_OPTIONS` — the very list
 * the client strips at runtime (the danger of each one is explained there too).
 * Rewriting the union of keys by hand is not allowed: a divergence of the two
 * copies brings the identity leak back, and the compiler will not say a word
 * about it.
 */
export type TApiRequestOptions = Omit<
    NonNullable<Parameters<TRawApiFetcher>[1]>,
    (typeof CLIENT_OWNED_REQUEST_OPTIONS)[number]
>;

/**
 * Fetcher of the builder API.
 *
 * It is a wrapper over an ofetch instance rather than the instance itself: the
 * waiting ceiling is set before the call so that an abort by it can be recognized
 * on the way out (in the browser the platform loses the reason of an abort during
 * the body-reading phase — see `normalizeRequestAbortError`). The price of the
 * wrapper is that the Nitro typing of the routes by URL is not inferred here; the
 * response generic is stated at the call site.
 */
export interface IApiFetcher {
    <T = unknown>(request: string, options?: TApiRequestOptions): Promise<T>;
}

/**
 * Return value of `useApiClient`.
 */
export interface IUseApiClientReturn {
    /** Fetcher of the builder API with a waiting ceiling and a recognizable abort */
    apiFetcher: IApiFetcher;
}
// #endregion

// #region useBrickImports
/**
 * Return value of `useBrickImports`.
 */
export interface IUseBrickImportsReturn {
    /**
     * Looks up the loader of a brick module by the `brickPath` from the component
     * schema. `undefined` — either a layout block (which has no brick file) or a
     * miss in the loader map.
     */
    findImportModule: (brickPath: string) => (() => Promise<IBrickExportModule>) | undefined;
    /**
     * Whether there is a loader for this `brickPath`. Unlike `findImportModule` it
     * stays silent on a miss — it is meant to be called from computed properties.
     */
    hasBrickModule: (brickPath: string) => boolean;
}
// #endregion

// #region useBricksAssetUrl
/**
 * Return value of `useBricksAssetUrl`.
 */
export interface IUseBricksAssetUrlReturn {
    /** The application's `app.baseURL` (`/` when not configured) */
    baseURL: string;
    /** URL of a public asset of the module (`/_bricks/...`) honoring `app.baseURL` */
    resolveAssetUrl: (assetPath: string) => string;
}
// #endregion

// #region useBricksConfig
/**
 * Return value of `useBricksConfig`: the landing configuration with the defaults
 * filled in.
 */
export interface IUseBricksConfigReturn {
    /** Default font of the page content */
    defaultFont: string;
    /** Additional fonts declared by the consumer (who also loads them) */
    fonts?: string[];
    /** Page background */
    backgroundColor: string;
    /** Layout blocks available in the builder */
    layouts: string[];
}
// #endregion

// #region useBricksDevices
/**
 * Return value of `useBricksDevices`.
 *
 * The page set is deliberately absent here: the composable lives in `common` and
 * knows nothing about a page — its config is passed in by whoever loaded it.
 */
export interface IUseBricksDevicesReturn {
    /** Resolved project set (the module option on top of the constant) */
    projectDevices: TBricksResolvedDeviceSet;
    /** Resolves the `viewport_config` of a page on top of the project set */
    resolvePageDevices: (pageConfig: unknown) => TBricksResolvedDeviceSet;
    /** Window width ranges derived from the set */
    deviceRanges: (devices: ReadonlyArray<IBricksPageDevice>) => IBricksDeviceRange[];
}
// #endregion

// #region useBricksRoutePaths
/**
 * Return value of `useBricksRoutePaths`.
 */
export interface IUseBricksRoutePathsReturn {
    /** Active route prefixes */
    prefixes: IBricksRoutePrefixes;
    /** Logical path of the builder dashboard (without the baseURL) */
    builderRootPath: string;
    /** Logical path of the login page (without the baseURL) */
    builderLoginPath: string;
    /**
     * Logical path of the page preview (without the baseURL); with a `versionId` —
     * preview of a saved version (`?version=`).
     */
    previewPagePath: (address: IBricksPageAddress, versionId?: number) => string;
    /** Adds `app.baseURL` — for `window.location`/`window.open`/`<a href>` */
    withBase: (path: string) => string;
    /** Strips `app.baseURL` off the actual pathname */
    stripBase: (pathname: string) => string;
    /** Whether the path belongs to the builder surface */
    isBuilderPath: (pathname: string) => boolean;
}

export interface IUseBricksPageAddressReturn {
    /**
     * Whether the live address of a page (`/<urlPrefix>/<pagename>`) is free in the
     * application routing: whether it is taken by a builder surface or by a page of
     * the consumer.
     */
    isPageAddressFree: (address: IBricksPageAddress) => boolean;
    /** Whether the editor address of a page (`<builderPrefix>/<urlPrefix>/<pagename>`) is free */
    isEditorAddressFree: (address: IBricksPageAddress) => boolean;
}
// #endregion
