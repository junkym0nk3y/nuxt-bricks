/**
 * Resolving the client IP for the rate limiters.
 *
 * By default only the socket address of the connection is used — the module does
 * not trust the x-forwarded-* headers (the client itself may send them). Behind
 * a reverse proxy the socket address is the same for every request (the address
 * of the proxy), and the per-IP limits collapse into one shared bucket — for
 * that case there is the `bricks.trustProxy` opt-in (env NUXT_BRICKS_TRUST_PROXY):
 * the **last** element of `x-forwarded-for` is taken, the one appended by the
 * nearest trusted proxy hop; the first element can be forged by the client by
 * sending a header of its own (an appending proxy keeps it).
 *
 * A limitation: trustProxy is designed for exactly one trusted proxy hop in
 * front of the application. Chains of several proxies require the outermost hop
 * to overwrite x-forwarded-for.
 */
import { getRequestHeader, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { parseBricksBooleanFlag } from '../../modules/common/utils/main';

/** Placeholder key used when the IP could not be determined */
const UNKNOWN_CLIENT_IP = 'unknown';

/**
 * Coerces a runtimeConfig/env value into the boolean trustProxy flag.
 *
 * @param value - Value of `bricksTrustProxy` (a boolean from the options or a
 * string from env).
 */
export function parseTrustProxyFlag(value: unknown): boolean {
    return parseBricksBooleanFlag(value);
}

/**
 * The pure resolution of the client IP from the header and the socket address.
 *
 * @param xForwardedFor - Value of the x-forwarded-for header, as received.
 * @param socketAddress - remoteAddress of the socket connection.
 * @param trustProxy - Whether to trust x-forwarded-for (the nearest proxy hop).
 */
export function resolveClientIp(
    xForwardedFor: string | undefined,
    socketAddress: string | undefined,
    trustProxy: boolean
): string {
    if (trustProxy && xForwardedFor) {
        const lastHopEntry = xForwardedFor
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .at(-1);

        if (lastHopEntry) {
            return lastHopEntry;
        }
    }

    return socketAddress || UNKNOWN_CLIENT_IP;
}

/**
 * Returns the client IP of the request, honoring the trustProxy configuration.
 *
 * @param event - Request event.
 */
export function resolveRequestClientIp(event: H3Event): string {
    const trustProxy = parseTrustProxyFlag(useRuntimeConfig(event).bricksTrustProxy);

    return resolveClientIp(
        getRequestHeader(event, 'x-forwarded-for'),
        event.node.req.socket?.remoteAddress ?? undefined,
        trustProxy
    );
}
