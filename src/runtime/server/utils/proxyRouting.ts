/**
 * Routing of the dev proxy middleware (pure functions): decides whether a
 * request is proxied to PROXY_URL, and builds the target URL.
 *
 * The decision is made on the parsed pathname (without query and hash — the
 * former `startsWith` over the full URL let bricks paths carrying a query
 * through to the proxy) and on segment boundaries (`/api/bricksmith` is not a
 * bricks path).
 *
 * `/api/bricks/**` (health probes included) is NEVER proxied: since
 * bricks.backend.mode was introduced, persistence is not selected by PROXY_URL —
 * every bricks handler is local.
 */

import { joinURL } from 'ufo';

import { isLocalApiPathname, matchesPathPrefix } from '../../modules/common/utils/localApiPaths';

// #region Constants
const API_PREFIX = '/api';
// #endregion

/**
 * Extracts the pathname from the URL of an incoming request (origin form or
 * absolute form), dropping query and hash.
 *
 * @param url - `req.url` of the incoming request.
 * @returns The request pathname, or an empty string when the URL is missing or
 * invalid.
 */
export function resolveRequestPathname(url: string | undefined): string {
    if (!url) {
        return '';
    }

    try {
        return new URL(url, 'http://internal').pathname;
    } catch {
        return '';
    }
}

/**
 * Extracts pathname plus query from the URL of an incoming request (to build the
 * proxy target URL — the query must reach the upstream).
 *
 * @param url - `req.url` of the incoming request.
 * @returns `pathname?query`, or an empty string when the URL is missing or
 * invalid.
 */
export function resolveRequestPathWithQuery(url: string | undefined): string {
    if (!url) {
        return '';
    }

    try {
        const parsed = new URL(url, 'http://internal');
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return '';
    }
}

/**
 * Decides whether a request should be proxied to the external backend
 * (PROXY_URL): `/api/bricks/**` never (local Nitro handlers), the rest of
 * `/api/**` yes.
 *
 * @param pathname - Parsed request pathname (see resolveRequestPathname).
 * @returns true when the request is proxied.
 */
export function shouldProxyRequest(pathname: string): boolean {
    if (!pathname) {
        return false;
    }

    // The bricks API is NEVER proxied (local Nitro routes); the predicate is
    // shared with useApiClient — common/utils/localApiPaths.ts
    if (isLocalApiPathname(pathname)) {
        return false;
    }

    return matchesPathPrefix(pathname, API_PREFIX);
}

/**
 * Builds the proxy target URL out of the base (PROXY_URL) and the request path.
 * joinURL normalizes the slashes at the seam: the former bare concatenation of
 * h3-proxy produced `http://host:portapi/...` → a 502 for a PROXY_URL without a
 * trailing slash.
 *
 * @param baseUrl - PROXY_URL (with or without a trailing slash, may carry a base
 * path).
 * @param pathnameWithQuery - Request path with its query (see
 * resolveRequestPathWithQuery).
 * @returns The absolute URL of the upstream request.
 */
export function buildProxyTargetUrl(baseUrl: string, pathnameWithQuery: string): string {
    return joinURL(baseUrl, pathnameWithQuery);
}
