/**
 * Pure predicates for the local API paths — the single copy of the rule
 * "`/api/bricks/**` is always served by the local Nitro endpoints" for both the
 * client (useApiClient) and the server (devProxy routing).
 * Since bricks.backend.mode was introduced, persistence is no longer selected by
 * PROXY_URL, so the decision does not depend on whether a database is present.
 */

import { BRICKS_API_PREFIX } from '../constants/apiPaths';

// #region Constants
/** Prefixes of the local endpoints: persistence, health, auth, component
 * library, media proxy, page thumbnail. */
const LOCAL_API_PREFIXES = [BRICKS_API_PREFIX];

/**
 * Synthetic base for parsing an origin-form request string. A domain in the
 * `.invalid` zone (RFC 2606) cannot belong to a real service.
 *
 * A host matching this base is NOT proof that the string carried no authority of
 * its own: the string is free to name the same host itself
 * (`//local-api.invalid/api/bricks/x`), and the comparison would not tell the
 * difference. That is why an authority is recognized syntactically, before the
 * parsing (`startsWithAuthority`), and the comparison with the base host stays as
 * a second net.
 */
const INTERNAL_PARSE_BASE = new URL('http://local-api.invalid');

/**
 * Characters the URL parser drops from the string before parsing: they can be
 * used to disguise the start of an authority (`/<TAB>/host`).
 */
const URL_IGNORED_CHARS_PATTERN = /[\t\n\r]/g;

/**
 * Start of an authority per WHATWG: two slashes, either of which may be a
 * backslash (`//host`, `/\host`, `/\/host`).
 */
const AUTHORITY_START_PATTERN = /^[/\\]{2}/;
// #endregion

/**
 * Checks that the pathname lies inside the prefix on a segment boundary:
 * `/api/bricks/x` and `/api/bricks` — yes, `/api/bricksmith` — no.
 *
 * @param pathname - Parsed pathname of the request (without query/hash).
 * @param prefix - Prefix without a trailing slash.
 * @returns true if the pathname is the prefix itself or a path under it.
 */
export function matchesPathPrefix(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Decides whether the pathname is a local API path of the module
 * (`/api/bricks/**`).
 *
 * @param pathname - Parsed pathname of the request (without query/hash).
 * @returns true for local bricks paths.
 */
export function isLocalApiPathname(pathname: string): boolean {
    return LOCAL_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

/**
 * Whether the request string starts with an authority — that is, whether it
 * addresses a host rather than a path of the current origin. The TAB/LF/CR the
 * parser ignores are stripped before the check: the parser sees `/<TAB>/host` as
 * `//host`.
 *
 * @param request - $fetch request string.
 * @returns true if the string carries an authority.
 */
function startsWithAuthority(request: string): boolean {
    return AUTHORITY_START_PATTERN.test(request.replace(URL_IGNORED_CHARS_PATTERN, ''));
}

/**
 * Decides by the $fetch request string whether this is a local API path:
 * origin-form (`/api/bricks/pages?x=1`) is parsed down to the pathname
 * (query/hash do not affect the decision), while absolute URLs and paths without
 * a leading slash are not considered local (the baseURL switch is not applied to
 * them).
 *
 * An address with an authority is not considered local in any spelling: it would
 * receive the installation identity meant for our own endpoints only, while its
 * pathname looks just like one of ours. The syntax decides, not the comparison
 * with the parse base: the string is free to name the base host itself, and then
 * the comparison would let a foreign authority through
 * (`//local-api.invalid/api/bricks/x`).
 *
 * The host comparison is kept after the syntactic check, but with it in place the
 * comparison is unreachable: a string with a leading `/` and without the start of
 * an authority cannot substitute the base host. It is a safety net in case the
 * checks above are ever relaxed (say, absolute URLs get allowed) — which is why
 * no spec covers it: the "remove the comparison" mutation does not turn the suite
 * red, and that is expected.
 *
 * @param request - $fetch request string (a path, possibly with query/hash).
 * @returns true if the request must go to the local Nuxt server.
 */
export function isLocalApiRequest(request: string): boolean {
    if (!request.startsWith('/') || startsWithAuthority(request)) {
        return false;
    }

    try {
        const parsed = new URL(request, INTERNAL_PARSE_BASE);

        if (parsed.host !== INTERNAL_PARSE_BASE.host) {
            return false;
        }

        return isLocalApiPathname(parsed.pathname);
    } catch {
        return false;
    }
}
