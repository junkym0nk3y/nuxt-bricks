/**
 * Database-auth cookie sessions: generating and hashing the opaque token and
 * working with the HttpOnly `bricks-session` cookie.
 *
 * The cookie carries the token (32 bytes, base64url), the database only its
 * SHA-256 hex: a leaked database dump yields no ready-made tokens, and no
 * session secret is needed.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getCookie, setCookie, deleteCookie, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { BRICKS_SESSION_COOKIE_NAME } from '../../../modules/common/constants/auth';

/** Session cookie name (single source — common, see the proxy header filtering) */
export const SESSION_COOKIE_NAME = BRICKS_SESSION_COOKIE_NAME;

/** Default session lifetime — 7 days (mirrors the default of the module option) */
const DEFAULT_SESSION_MAX_AGE_SECONDS = 604800;

/**
 * Generates the opaque session token (32 bytes, base64url).
 */
export function generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Returns the SHA-256 hex of the token — the session key in the database.
 */
export function hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Returns the session lifetime in seconds from runtimeConfig
 * (an env value arrives as a string and is coerced to a number).
 */
export function resolveSessionMaxAgeSeconds(): number {
    const config = useRuntimeConfig();
    const raw = config.bricksAuthSessionMaxAge as number | string | undefined;
    const maxAge = Number(raw);

    return Number.isFinite(maxAge) && maxAge > 0 ? maxAge : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

/**
 * Reads the session token from the request cookie.
 */
export function getSessionTokenFromCookie(event: H3Event): string | null {
    return getCookie(event, SESSION_COOKIE_NAME) ?? null;
}

/**
 * Sets the HttpOnly session cookie (SameSite=Lax, Secure in production, path=/).
 *
 * @param event - Request event.
 * @param token - The opaque token (not its hash).
 * @param maxAgeSeconds - Cookie lifetime in seconds.
 */
export function setSessionCookie(event: H3Event, token: string, maxAgeSeconds: number): void {
    setCookie(event, SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: maxAgeSeconds,
    });
}

/**
 * Deletes the session cookie (logout or an invalid session).
 */
export function clearSessionCookie(event: H3Event): void {
    deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });
}
