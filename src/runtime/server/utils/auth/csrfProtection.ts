/**
 * CSRF protection for unsafe requests to the bricks API.
 *
 * A SameSite=Lax session cookie does not cover same-site sibling domains, and
 * Basic Auth is replayed by the browser automatically — so unsafe methods on
 * the module surfaces demand proof of same origin: the custom `x-bricks-csrf`
 * header, or Sec-Fetch-Site: same-origin/none, or a match of the FULL origin
 * (scheme + hostname + port; the default port of the scheme is omitted) in the
 * Origin header against the effective origin of the request — the effective
 * protocol is taken from the TLS state of the socket or from the last hop of
 * x-forwarded-proto under bricks.trustProxy, the effective host from Host or the
 * last hop of x-forwarded-host (an http origin is not same-origin for an https
 * surface). A service on another port or scheme of the same host does not count
 * as same origin. A request carrying no evidence of its origin is rejected
 * with 403.
 */
import { createError, getRequestHeader, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { BRICKS_CSRF_HEADER_NAME } from '../../../modules/common/constants/auth';
import { BRICKS_API_PREFIX } from '../../../modules/common/constants/apiPaths';
import { matchesPathPrefix } from '../../../modules/common/utils/localApiPaths';
import { parseTrustProxyFlag } from '../requestClientIp';

/** Methods that need no CSRF check (safe per RFC 9110) */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Sec-Fetch-Site values that confirm a non-cross-site request */
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);

/** Effective request protocol (socket TLS or a trusted x-forwarded-proto) */
export type TEffectiveProtocol = 'http' | 'https';

/** Request context for the pure CSRF check */
export interface ICsrfRequestContext {
    method: string;
    origin: string | undefined;
    secFetchSite: string | undefined;
    hasCsrfHeader: boolean;
    effectiveHost: string | undefined;
    effectiveProtocol: TEffectiveProtocol;
}

export type TCsrfCheckResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Builds the normalized comparison form of an origin: scheme + lowercase
 * hostname without a trailing dot + port. The default port OF ITS OWN scheme
 * has already been cut by the URL parser (`http://…:80` → empty port), a
 * non-default one (`http://…:443`) is kept and takes part in the comparison.
 *
 * @param parsed - Parsed URL of the origin (the Origin header or
 * `protocol://Host` of the request).
 * @returns Either `scheme://hostname` or `scheme://hostname:port`.
 */
function buildComparableOrigin(parsed: URL): string {
    const normalizedHostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

    return parsed.port
        ? `${parsed.protocol}//${normalizedHostname}:${parsed.port}`
        : `${parsed.protocol}//${normalizedHostname}`;
}

/**
 * The normalized request origin, built from the effective protocol and the Host
 * header (which may carry a port). Parsing under THE SAME scheme as the origin
 * side gives a symmetric normalization of the default port.
 *
 * @param protocol - Effective request protocol.
 * @param host - Value of Host or x-forwarded-host.
 * @returns The normalized origin, or null for a garbage value.
 */
function parseComparableRequestOrigin(protocol: TEffectiveProtocol, host: string): string | null {
    try {
        return buildComparableOrigin(new URL(`${protocol}://${host}`));
    } catch {
        return null;
    }
}

/**
 * The path is inside the CSRF scope of the module: all of /api/bricks
 * (including the auth handlers, which are not under the auth matrix, the media
 * proxy and the page thumbnail).
 *
 * On a segment boundary: a route of the consumer whose name merely starts with
 * `bricks` (`/api/bricksmith`) is not ours, and refusing its POST with 403 would
 * be a namespace takeover — the same predicate the routing of the client and of
 * the dev proxy uses.
 *
 * @param pathname - Logical request path (without baseURL).
 */
export function isCsrfProtectedPath(pathname: string): boolean {
    return matchesPathPrefix(pathname, BRICKS_API_PREFIX);
}

/**
 * The pure CSRF check over a request context (order: safe method → custom
 * header → Sec-Fetch-Site → Origin → refusal).
 *
 * @param context - Evidence of origin extracted from the request.
 * @returns The result; on refusal, a machine-readable reason for the log.
 */
export function checkCsrf(context: ICsrfRequestContext): TCsrfCheckResult {
    if (SAFE_METHODS.has(context.method.toUpperCase())) {
        return { allowed: true };
    }

    if (context.hasCsrfHeader) {
        return { allowed: true };
    }

    if (context.secFetchSite) {
        return TRUSTED_FETCH_SITES.has(context.secFetchSite.toLowerCase())
            ? { allowed: true }
            : { allowed: false, reason: `sec-fetch-site "${context.secFetchSite}"` };
    }

    if (context.origin) {
        if (context.origin === 'null') {
            return { allowed: false, reason: 'opaque origin' };
        }

        let originComparable: string;

        try {
            originComparable = buildComparableOrigin(new URL(context.origin));
        } catch {
            return { allowed: false, reason: 'malformed origin' };
        }

        const requestOrigin = context.effectiveHost
            ? parseComparableRequestOrigin(context.effectiveProtocol, context.effectiveHost)
            : null;

        if (!requestOrigin) {
            return { allowed: false, reason: 'missing effective host' };
        }

        return originComparable === requestOrigin
            ? { allowed: true }
            : {
                  allowed: false,
                  reason: `origin "${originComparable}" does not match request origin "${requestOrigin}"`,
              };
    }

    return { allowed: false, reason: 'no origin evidence (send x-bricks-csrf header)' };
}

/**
 * Effective request protocol: the TLS state of the socket; behind a trusted
 * proxy, the last hop of x-forwarded-proto (appended by the nearest proxy; the
 * first one is spoofable by the client — the resolveClientIp pattern). An
 * invalid header value is ignored in favor of the socket.
 *
 * @param event - Request event.
 * @param trustProxy - Whether bricks.trustProxy is on.
 */
function resolveEffectiveProtocol(event: H3Event, trustProxy: boolean): TEffectiveProtocol {
    const forwardedProto = trustProxy
        ? getRequestHeader(event, 'x-forwarded-proto')?.split(',').at(-1)?.trim().toLowerCase()
        : undefined;

    if (forwardedProto === 'http' || forwardedProto === 'https') {
        return forwardedProto;
    }

    const socket = event.node.req.socket as { encrypted?: boolean } | undefined;

    return socket?.encrypted ? 'https' : 'http';
}

/**
 * The h3 wrapper: assembles the context from headers and throws 403 on refusal.
 * The reason for the refusal goes to the server log only, never to the response.
 *
 * @param event - Request event.
 */
export function assertCsrfSafe(event: H3Event): void {
    const method = event.node.req.method || 'GET';

    if (SAFE_METHODS.has(method)) {
        return;
    }

    const trustProxy = parseTrustProxyFlag(useRuntimeConfig(event).bricksTrustProxy);
    // The last x-forwarded-host token is appended by the nearest trusted proxy;
    // the first one is spoofable by the client when the proxy appends
    // (the resolveClientIp pattern)
    const forwardedHost = trustProxy
        ? getRequestHeader(event, 'x-forwarded-host')?.split(',').at(-1)?.trim()
        : undefined;

    const result = checkCsrf({
        method,
        origin: getRequestHeader(event, 'origin'),
        secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
        hasCsrfHeader: Boolean(getRequestHeader(event, BRICKS_CSRF_HEADER_NAME)),
        effectiveHost: forwardedHost || getRequestHeader(event, 'host'),
        effectiveProtocol: resolveEffectiveProtocol(event, trustProxy),
    });

    if (result.allowed) {
        return;
    }

    console.warn('[nuxt-bricks] CSRF check rejected request:', {
        path: event.node.req.url,
        method,
        reason: result.reason,
    });

    throw createError({ statusCode: 403, statusMessage: 'Cross-site request rejected' });
}
