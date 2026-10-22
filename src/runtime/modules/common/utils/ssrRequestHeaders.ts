/**
 * Headers of the incoming SSR request that the builder API client forwards on, and
 * the "local endpoints vs external endpoint" boundary.
 *
 * The rule is extracted as pure functions because it has two opposite edges and
 * both are mandatory:
 * - the builder identity (the session cookie of database auth and the
 *   `Authorization` of basic mode) is a secret of the installation and is not
 *   meant for an external service;
 * - that same identity is mandatory for the local `/api/bricks/**`: the editorial
 *   API is protected in its entirety, and without it the builder SSR gets a 401
 *   from those endpoints (the preview returned the page with a 401 status, the
 *   dashboard degraded into a spinner).
 */

// #region Imports
// Types
import type { IncomingHttpHeaders } from 'http';

// Utils
import { stripCookieByName } from './cookieHeader';

// Constants
import { BRICKS_SESSION_COOKIE_NAME } from '../constants/auth';
// #endregion

// #region Data
/**
 * Headers forwarded from the SSR request into the API request: the client address
 * for the server-side limits and the identity of the request.
 */
const FORWARDED_HEADERS: string[] = [
    'x-real-ip',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-port',
    'x-forwarded-proto',
    'cookie',
    'authorization',
];

/**
 * The builder identity: the headers `toExternalHeaders` strips and which therefore
 * have to be returned to the local endpoints in their original shape. One list for
 * both actions — otherwise whatever is stripped from the defaults would silently be
 * lost on the local endpoints as well.
 */
const IDENTITY_HEADERS: string[] = ['cookie', 'authorization'];
// #endregion

// #region Methods
/**
 * Collects the forwardable headers out of the incoming SSR request.
 *
 * @param reqHeaders - Headers of the incoming request (absent outside SSR).
 * @returns The forwardable headers only, with lowercased names.
 */
export function pickForwardedHeaders(
    reqHeaders: IncomingHttpHeaders | undefined
): Record<string, string> {
    if (!reqHeaders) {
        return {};
    }

    return FORWARDED_HEADERS.reduce((result: Record<string, string>, header: string) => {
        const value = reqHeaders[header];

        if (value) {
            result[header] = <string>value;
        }

        return result;
    }, {});
}

/**
 * Returns a copy of the headers without the builder identity: the session cookie
 * and `Authorization`. After the first challenge the browser sends the basic
 * credentials to every path of the origin, the SSR document included — they must
 * not go outside, an external service has an authorization of its own. The other
 * cookies and headers of the project pass as they are.
 *
 * The result is the default headers of the client: they go out with EVERY request,
 * including one to an absolute URL on a foreign origin (for such a URL ofetch does
 * not apply the baseURL, but it does apply the headers). That is why the boundary
 * here is fail-closed: the identity is inherited by nobody, and it is returned to
 * the local `/api/bricks/**` per address.
 *
 * The stripping is unconditional, not per auth mode. The dev proxy strips
 * `Authorization` in basic mode only (`devProxyHandler.ts`), on the assumption that
 * in database mode the header belongs to the host project — but the authorization
 * mode of bricks proves nothing about where the header came from: it may just as
 * well be an infrastructure Basic in front of the installation. The invariant is
 * stated in terms of the source rather than of the mode: identity captured from the
 * incoming SSR request does not go outside. Explicit credentials passed by the
 * caller in the request options are not covered by the ban — ofetch mixes them in
 * on top of the defaults.
 *
 * @param headers - Headers collected from the SSR request.
 * @returns Headers safe for any endpoint.
 */
export function toExternalHeaders(headers: Record<string, string>): Record<string, string> {
    const externalHeaders = { ...headers };

    delete externalHeaders.authorization;

    if (externalHeaders.cookie) {
        const cookie = stripCookieByName(externalHeaders.cookie, BRICKS_SESSION_COOKIE_NAME);

        if (cookie) {
            externalHeaders.cookie = cookie;
        } else {
            delete externalHeaders.cookie;
        }
    }

    return externalHeaders;
}

/**
 * Returns the identity headers in their original shape — to be added per address to
 * the requests hitting the local endpoints: the client's default headers do not
 * carry them.
 *
 * @param headers - Headers collected from the SSR request.
 * @returns Only the identity headers present in the request.
 */
export function pickIdentityHeaders(headers: Record<string, string>): Record<string, string> {
    return IDENTITY_HEADERS.reduce((result: Record<string, string>, header: string) => {
        if (headers[header]) {
            result[header] = headers[header];
        }

        return result;
    }, {});
}
// #endregion
