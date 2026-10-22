/**
 * Single source for the paths of the bricks surfaces: the builder and preview
 * prefixes (`bricks.routes` in nuxt.config, `runtimeConfig.public.bricksRoutes`
 * at runtime) and everything that touches `app.baseURL`.
 *
 * Used at build time (module.ts — page registration and validation), by the
 * server (auth matrix, redirect to login) and by the client
 * (`useBricksRoutePaths`, the builder plugin gate). Hardcoded `/bricks` and
 * `/preview` are forbidden in new code — these helpers only.
 */

import type { IBricksPageAddress } from '../../types/pageAddress';
import { getPageAddressKey } from './pageAddress';
import { PREVIEW_VERSION_QUERY_PARAM } from './previewRoute';
import { BRICKS_BUILDER_PAGE_ROUTE_NAMES, BRICKS_ROUTE_NAMES } from '../../constants/routes';

/** Route prefixes of the bricks surfaces */
export interface IBricksRoutePrefixes {
    /** Builder prefix: dashboard at `<prefix>`, editor at `<prefix>/:pagename` */
    builderPrefix: string;
    /** Render preview prefix: `<prefix>/:pagename` */
    previewPrefix: string;
}

/**
 * Default prefixes. Every surface of the module sits in the `bricks-` namespace
 * deliberately: each occupied prefix takes a published address away from the
 * consumer, and `/preview` is too common a URL to claim for the builder preview.
 */
export const DEFAULT_BRICKS_ROUTE_PREFIXES: IBricksRoutePrefixes = {
    builderPrefix: '/bricks',
    previewPrefix: '/bricks-preview',
};

/**
 * Login page segment inside the builder prefix. A single source for both the
 * route registration and the reservation of the same pagename: once they drift
 * apart, the result is either an unreachable editor or a ban with no reason
 * behind it.
 *
 * In the `bricks-` namespace for the same reason as the prefixes: a `login`
 * segment would take away the consumer's editor for their own `/login` page.
 */
export const BUILDER_LOGIN_SEGMENT = 'bricks-login';

/** Prefix format: leading `/`, lowercase segments, no trailing slash */
const ROUTE_PREFIX_PATTERN = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

/** Root segments reserved by other surfaces of the module or of Nuxt */
const RESERVED_ROOT_SEGMENTS = ['api', '_nuxt', '__nuxt_error'];

/** Routes a published page is supposed to open on */
const PUBLISHED_PAGE_ROUTE_NAMES: readonly string[] = [
    BRICKS_ROUTE_NAMES.page,
    BRICKS_ROUTE_NAMES.pagePrefixed,
];

/**
 * Owner of a path that has no string name: in vue-router a route name is
 * optional and may be a `Symbol`. Such a route still occupies the address, so
 * the resolver has to tell it apart from "nothing matched at all" — otherwise a
 * nameless consumer page would silently shadow a published address.
 */
export const UNNAMED_ROUTE_OWNER = '(unnamed route)';

/**
 * Whether the path belongs to the prefix subtree (the prefix itself or
 * `<prefix>/**`).
 *
 * @param prefix - Prefix without a trailing slash.
 * @param pathname - Path being checked.
 */
function matchesPathPrefix(prefix: string, pathname: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Non-empty path segments: `/admin/builder` → `['admin', 'builder']`.
 *
 * @param path - Path with a leading `/`.
 */
function getPathSegments(path: string): string[] {
    return path.split('/').filter(Boolean);
}

/**
 * Validates a single prefix; throws with the option name — fail-fast on module
 * startup.
 *
 * @param name - Option name for the error message.
 * @param prefix - Prefix value.
 */
function validateRoutePrefix(name: string, prefix: string): void {
    if (!ROUTE_PREFIX_PATTERN.test(prefix)) {
        throw new Error(
            `[nuxt-bricks] Invalid bricks.routes.${name}: "${prefix}". ` +
                'Expected a leading "/", lowercase [a-z0-9-] segments and no trailing slash (e.g. "/admin/builder").'
        );
    }

    const rootSegment = getPathSegments(prefix)[0];

    if (RESERVED_ROOT_SEGMENTS.includes(rootSegment)) {
        throw new Error(
            `[nuxt-bricks] Invalid bricks.routes.${name}: "${prefix}" — root segment "/${rootSegment}" is reserved.`
        );
    }
}

/**
 * Validates the pair of prefixes: the format of each one plus the absence of an
 * overlap (equality or nesting breaks both the routing and the auth matrix).
 * Throws an Error — module.ts calls this in setup, so the error fails the build.
 *
 * @param prefixes - Prefixes from the module options.
 */
export function validateBricksRoutePrefixes(prefixes: IBricksRoutePrefixes): void {
    validateRoutePrefix('builderPrefix', prefixes.builderPrefix);
    validateRoutePrefix('previewPrefix', prefixes.previewPrefix);

    if (
        matchesPathPrefix(prefixes.builderPrefix, prefixes.previewPrefix) ||
        matchesPathPrefix(prefixes.previewPrefix, prefixes.builderPrefix)
    ) {
        throw new Error(
            `[nuxt-bricks] bricks.routes.builderPrefix ("${prefixes.builderPrefix}") and previewPrefix ("${prefixes.previewPrefix}") must not overlap.`
        );
    }
}

/**
 * Path of the database-auth login page.
 *
 * @param prefixes - Active prefixes.
 */
export function getBuilderLoginPath(prefixes: IBricksRoutePrefixes): string {
    return `${prefixes.builderPrefix}/${BUILDER_LOGIN_SEGMENT}`;
}

/**
 * Preview path of a page; with a `versionId` — preview of a saved version.
 *
 * Address-based, just like the editor path: the preview is opened from the
 * editor of a specific page, and keyed by name alone the "Preview" button of
 * `/news/post` would open a tab the builder then fills with the schema of
 * `/blog/post`.
 *
 * @param prefixes - Active prefixes.
 * @param address - Page address.
 * @param versionId - Version id for `?version=` (without it — the current state).
 */
export function getPreviewPagePath(
    prefixes: IBricksRoutePrefixes,
    address: IBricksPageAddress,
    versionId?: number
): string {
    const path = `${prefixes.previewPrefix}/${getPageAddressKey(address)}`;

    return versionId === undefined
        ? path
        : `${path}?${PREVIEW_VERSION_QUERY_PARAM}=${encodeURIComponent(versionId)}`;
}

/**
 * Whether the path belongs to the builder surface (`<builderPrefix>` and
 * `<builderPrefix>/**`).
 *
 * @param prefixes - Active prefixes.
 * @param pathname - Path without the baseURL.
 */
export function isBuilderPath(prefixes: IBricksRoutePrefixes, pathname: string): boolean {
    return matchesPathPrefix(prefixes.builderPrefix, pathname);
}

/**
 * Whether the path is an HTML page of the builder or of the preview (picks
 * redirect vs 401 in auth).
 *
 * @param prefixes - Active prefixes.
 * @param pathname - Path without the baseURL.
 */
export function isProtectedBricksHtmlPath(
    prefixes: IBricksRoutePrefixes,
    pathname: string
): boolean {
    return (
        matchesPathPrefix(prefixes.builderPrefix, pathname) ||
        matchesPathPrefix(prefixes.previewPrefix, pathname)
    );
}

/**
 * Logical live address of a published page: `/<urlPrefix>/<pagename>` or
 * `/<pagename>` without a prefix.
 *
 * Derived from the canonical address key (`getPageAddressKey`) instead of
 * counting the segments itself: the address key already defines the one
 * serialization of the pair, and a second copy of the rule would drift away
 * from the keys of drafts and of the payload on a whitespace prefix.
 *
 * @param address - Page address.
 */
export function getPublishedPagePath(address: IBricksPageAddress): string {
    return `/${getPageAddressKey(address)}`;
}

/**
 * Static (parameterless) routes the module registers itself: path → route name.
 * Derived from the same prefixes and segments as the page registration, so it
 * cannot drift away from it.
 *
 * Needed where there is no live router (the server): to give
 * `isPageAddressTaken` and `isEditorAddressTaken` an answer to "who owns this
 * path" at least for our own surfaces. The client asks the application router
 * instead and sees the consumer's pages as well.
 *
 * @param prefixes - Active prefixes.
 */
export function getBricksOwnStaticRoutes(prefixes: IBricksRoutePrefixes): Record<string, string> {
    return {
        [prefixes.builderPrefix]: BRICKS_ROUTE_NAMES.builderIndex,
        [getBuilderLoginPath(prefixes)]: BRICKS_ROUTE_NAMES.builderLogin,
    };
}

/**
 * Whether the address is taken by a foreign route.
 *
 * The question goes to the routing ("who wins this path"), not to a list of
 * names: such a list would have to be maintained by hand, and it still would
 * not know about the pages of the consumer application. `undefined` from the
 * resolver means "no static owner", that is, the path goes to the expected
 * route.
 *
 * @param resolveRouteName - Name of the route that wins the path (undefined — nobody).
 * @param path - Path being checked.
 * @param expectedOwners - Routes the path is supposed to go to.
 */
function isPathTakenByOther(
    resolveRouteName: (path: string) => string | undefined,
    path: string,
    expectedOwners: readonly string[]
): boolean {
    const owner = resolveRouteName(path);

    return owner !== undefined && !expectedOwners.includes(owner);
}

/**
 * The live address of a published page is unavailable: either a foreign route
 * wins it, or it falls under a bricks surface entirely.
 *
 * The two reasons are checked separately because the second one is invisible to
 * the router: `<previewPrefix>` itself has no route (the preview lives on
 * `<prefix>/:pagename`), yet the auth matrix protects the prefix as well — a
 * public page on it would end up behind the builder login.
 *
 * @param prefixes - Active prefixes.
 * @param resolveRouteName - Resolver of a route name by path.
 * @param address - Page address.
 */
export function isPageAddressTaken(
    prefixes: IBricksRoutePrefixes,
    resolveRouteName: (path: string) => string | undefined,
    address: IBricksPageAddress
): boolean {
    const path = getPublishedPagePath(address);

    return (
        isProtectedBricksHtmlPath(prefixes, path) ||
        isPathTakenByOther(resolveRouteName, path, PUBLISHED_PAGE_ROUTE_NAMES)
    );
}

/**
 * Editor path of a page: `<builderPrefix>/<urlPrefix>/<pagename>` or
 * `<builderPrefix>/<pagename>` without a prefix. The editor address repeats the
 * page address because a name is unique only within its own prefix: the editors
 * of `/blog/post` and `/news/post` have to differ.
 *
 * @param prefixes - Active prefixes.
 * @param address - Page address.
 */
export function getBuilderPagePath(
    prefixes: IBricksRoutePrefixes,
    address: IBricksPageAddress
): string {
    return `${prefixes.builderPrefix}/${getPageAddressKey(address)}`;
}

/**
 * The address of the page EDITOR is taken: the editor path goes not to the
 * editor but to a static neighbor (the login page, a nested route of the
 * consumer). The published page itself is usually still reachable — it is
 * precisely its editor that is not, which is why this check is separate from
 * `isPageAddressTaken`.
 *
 * The full address is checked rather than the name alone: `bricks-login` with no
 * prefix really does take the path away from the login page, whereas
 * `blog/bricks-login` lives on the free `<builderPrefix>/blog/bricks-login` and
 * there is nothing to forbid it for.
 *
 * @param prefixes - Active prefixes.
 * @param resolveRouteName - Resolver of a route name by path.
 * @param address - Page address.
 */
export function isEditorAddressTaken(
    prefixes: IBricksRoutePrefixes,
    resolveRouteName: (path: string) => string | undefined,
    address: IBricksPageAddress
): boolean {
    return isPathTakenByOther(
        resolveRouteName,
        getBuilderPagePath(prefixes, address),
        BRICKS_BUILDER_PAGE_ROUTE_NAMES
    );
}

/**
 * Strips `app.baseURL` off the actual request pathname → the logical router
 * path. A foreign path (not under the base) is returned as is.
 *
 * @param pathname - Actual pathname (with the base).
 * @param baseURL - `app.baseURL` (`/` — no-op).
 */
export function stripPathBase(pathname: string, baseURL: string): string {
    if (!baseURL || baseURL === '/') {
        return pathname;
    }

    const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;

    if (pathname === base) {
        return '/';
    }

    return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

/**
 * Strips the trailing `/` — brings the path to the shape the router matches it
 * in.
 *
 * Needed wherever a path is checked against routes by hand (the protection and
 * permission matrices): radix3 in non-strict mode — and that is exactly how h3
 * sets it up — drops the trailing slash itself, so `/api/bricks/media/import/`
 * lands in the same handler as `/api/bricks/media/import`. Were a matrix to
 * check the raw path, the variant with the slash would match none of its entries
 * and would get the default permissions, while still calling the very same
 * handler.
 *
 * The root stays `/`: an empty path would no longer match anything at all.
 *
 * @param pathname - Path without the query.
 * @returns Path without a trailing slash.
 */
export function normalizePathTrailingSlash(pathname: string): string {
    if (pathname.length <= 1 || !pathname.endsWith('/')) {
        return pathname;
    }

    return pathname.replace(/\/+$/, '') || '/';
}

/**
 * Prepends `app.baseURL` to a logical path — for `window.location`,
 * `window.open` and server redirects, where the Nuxt router will not add the
 * base itself.
 *
 * @param baseURL - `app.baseURL` (`/` — no-op).
 * @param path - Logical path with a leading `/`.
 */
export function joinPathBase(baseURL: string, path: string): string {
    if (!baseURL || baseURL === '/') {
        return path;
    }

    const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;

    return `${base}${path}`;
}
