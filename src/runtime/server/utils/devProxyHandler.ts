/**
 * Factory of the dev proxying event handler (extracted out of the middleware for
 * integration tests over real sockets — test/server/devProxy.spec.ts: the
 * middleware is bound to nitropack's useRuntimeConfig and is not importable
 * outside Nitro).
 *
 * The transfer contract: method, query, body, status and headers pass through
 * unchanged in both directions, with one deliberate exception — the builder
 * identity is stripped on the way out (`stripBricksIdentityHeaders`), because the
 * upstream here is somebody else's service.
 *
 * Two deviations of the h3 proxyRequest are compensated explicitly:
 * - `accept` is part of the h3 ignoredHeaders → it is restored from the request;
 * - fetch follows redirects by default (the client would receive the final 200
 *   with no Location) → `redirect: 'manual'` passes 3xx plus Location through
 *   as they are.
 */

import { createError, defineEventHandler, proxyRequest, type EventHandler, type H3Event } from 'h3';
import { BRICKS_SESSION_COOKIE_NAME } from '../../modules/common/constants/auth';
import { stripCookieByName } from '../../modules/common/utils/cookieHeader';
import {
    buildProxyTargetUrl,
    resolveRequestPathname,
    resolveRequestPathWithQuery,
    shouldProxyRequest,
} from './proxyRouting';

// #region Types
export interface IDevProxyHandlerOptions {
    /** Upstream base URL (PROXY_URL); an empty string turns the proxy off */
    proxyUrl: string;
    /**
     * Bricks auth mode ('basic' | 'database') — governs the stripping of
     * Authorization.
     */
    authMode: string;
    /** Upstream request timeout, ms (default 30000) */
    timeoutMs?: number;
}
// #endregion

// #region Constants
/** Default timeout: a hung backend must not hang the dev server */
const DEFAULT_PROXY_TIMEOUT_MS = 30000;
// #endregion

/**
 * Strips the builder identity out of the request headers before forwarding to an
 * external backend: the database-auth session cookie and, in basic mode,
 * Authorization (after the first challenge the browser sends the bricks
 * credentials to every path of the origin) — the builder secrets are not meant
 * for an external service. The other cookies and headers of the project are
 * forwarded as they are.
 *
 * @param event - Event of the proxied request (headers are mutated in place).
 * @param authMode - Bricks auth mode.
 */
function stripBricksIdentityHeaders(event: H3Event, authMode: string): void {
    const headers = event.node.req.headers;

    if (headers.cookie) {
        const cookie = stripCookieByName(headers.cookie, BRICKS_SESSION_COOKIE_NAME);
        if (cookie) {
            headers.cookie = cookie;
        } else {
            delete headers.cookie;
        }
    }

    if (authMode === 'basic' && headers.authorization) {
        delete headers.authorization;
    }
}

/**
 * Creates the event handler that dev-proxies non-bricks /api/* to the upstream.
 *
 * @param options - Upstream URL, auth mode and timeout.
 * @returns An h3 event handler (for the devProxy.ts middleware and the tests).
 */
export function createDevProxyEventHandler(options: IDevProxyHandlerOptions): EventHandler {
    const { proxyUrl, authMode } = options;
    const timeoutMs = options.timeoutMs ?? DEFAULT_PROXY_TIMEOUT_MS;

    return defineEventHandler(async (event) => {
        if (!proxyUrl) {
            return;
        }

        const requestUrl = event.node.req.url;
        if (!shouldProxyRequest(resolveRequestPathname(requestUrl))) {
            return;
        }

        stripBricksIdentityHeaders(event, authMode);
        const targetUrl = buildProxyTargetUrl(proxyUrl, resolveRequestPathWithQuery(requestUrl));
        const accept = event.node.req.headers.accept;

        try {
            return await proxyRequest(event, targetUrl, {
                // accept is in the h3 ignoredHeaders: without restoring it
                // explicitly the upstream would see */* instead of the client header
                headers: accept ? { accept } : undefined,
                fetchOptions: {
                    // A 3xx is handed to the client as it is (Location is not followed)
                    redirect: 'manual',
                    signal: AbortSignal.timeout(timeoutMs),
                },
            });
        } catch {
            // A stable 502 instead of a raw fetch exception: an unreachable or
            // hung upstream is a gateway error, and the details of the cause are
            // not handed outward
            throw createError({ statusCode: 502, statusMessage: 'Bad Gateway' });
        }
    });
}
