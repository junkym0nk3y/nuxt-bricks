/**
 * Sanitizing of the return redirect path after a login.
 */

/**
 * Returns a safe internal path out of the `redirect` query parameter.
 * Only internal paths with a single leading `/` are allowed: `//host`, `/\`,
 * absolute URLs and non-strings are dropped — protection against an open redirect.
 *
 * @param raw - Value of the `redirect` query parameter.
 * @param fallbackPath - Default path (the builder dashboard out of `bricks.routes`).
 * @returns An internal path or `fallbackPath`.
 */
export function sanitizeRedirectPath(raw: unknown, fallbackPath: string): string {
    if (typeof raw !== 'string' || raw.length === 0) {
        return fallbackPath;
    }

    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
        return fallbackPath;
    }

    return raw;
}
