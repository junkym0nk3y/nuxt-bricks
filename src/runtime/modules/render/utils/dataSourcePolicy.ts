/**
 * Execution policy for the data sources of a published page (pure functions).
 *
 * Data sources are declared in brick files and executed by the renderer on every
 * SSR/refresh of a public page, so the client for them is a separate and
 * restricted one (see useDataSourceClient): no cookies and no identity, safe
 * methods only, absolute URLs by the host allow-list from
 * `bricks.dataSources.allowedHosts`.
 */

// #region Constants
/** Default timeout of a single data source request, ms. */
export const DEFAULT_DATA_SOURCE_TIMEOUT_MS = 10000;

/** Default limit of simultaneous data source requests per page. */
export const DEFAULT_DATA_SOURCE_CONCURRENCY = 6;

/** Default size limit of one data source response, bytes of the transport stream. */
export const DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES = 1024 * 1024;

/** Default maximum of data source requests per one page run. */
export const DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE = 24;

/** Default total wall-clock budget of all data sources of one run, ms. */
export const DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS = 15000;

/** Allowed data source HTTP methods (safe/idempotent — they run on render). */
const ALLOWED_DATA_SOURCE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Name of the run's emergency deadline error. A name of its own rather than
 * `TimeoutError`: the run swallows only its own deadline and returns a partial
 * result, while somebody else's timeout (a deliberate failure inside a request,
 * for example) has to get out.
 */
const DATA_SOURCE_DEADLINE_ERROR_NAME = 'BricksDataSourceDeadlineError';
// #endregion

// #region Types
export type TDataSourceUrlCheck = { allowed: true } | { allowed: false; reason: string };

export type TResolvedDataSourceMethod = 'GET' | 'HEAD';
// #endregion

/**
 * Creates the emergency deadline error of a data sources run.
 *
 * @param totalDeadlineMs - Internal wall-clock budget of the run, ms.
 * @returns An error with a recognizable name.
 */
export function createDataSourceDeadlineError(totalDeadlineMs: number): Error {
    const error = new Error(
        `Bricks data sources run exceeded its deadline (${totalDeadlineMs}ms budget)`
    );
    error.name = DATA_SOURCE_DEADLINE_ERROR_NAME;

    return error;
}

/**
 * The error is the emergency deadline of a data sources run.
 *
 * @param error - An arbitrary error.
 * @returns This is the run's deadline.
 */
export function isDataSourceDeadlineError(error: unknown): boolean {
    return error instanceof Error && error.name === DATA_SOURCE_DEADLINE_ERROR_NAME;
}

/**
 * Normalizes the data source HTTP method and checks it against the allow-list.
 *
 * @param method - Method from the data source declaration (any case, optional).
 * @returns The normalized method (upper case), or null when it is forbidden.
 */
export function resolveDataSourceMethod(method?: string): TResolvedDataSourceMethod | null {
    const normalized = (method || 'GET').toUpperCase();
    return ALLOWED_DATA_SOURCE_METHODS.has(normalized)
        ? (normalized as TResolvedDataSourceMethod)
        : null;
}

/**
 * Checks a data source URL against the policy: relative URLs are always allowed,
 * absolute ones only over http(s) to a host from the allow-list.
 *
 * @param url - Resolved request URL (after parameter substitution).
 * @param allowedHosts - Allowed hosts of absolute URLs (no port/protocol).
 * @returns The check result; on refusal, a machine-readable reason for the log.
 */
export function checkDataSourceUrl(url: string, allowedHosts: string[]): TDataSourceUrlCheck {
    if (!url) {
        return { allowed: false, reason: 'empty url' };
    }

    // A relative path inside the application (a protocol-relative `//host` is not one)
    if (url.startsWith('/') && !url.startsWith('//')) {
        return { allowed: true };
    }

    let parsed: URL;

    try {
        parsed = new URL(url);
    } catch {
        return { allowed: false, reason: 'url is neither relative nor absolute http(s)' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { allowed: false, reason: `protocol "${parsed.protocol}" is not allowed` };
    }

    const hostname = parsed.hostname.toLowerCase();
    const isAllowedHost = allowedHosts.some((host) => host.toLowerCase() === hostname);

    if (!isAllowedHost) {
        return {
            allowed: false,
            reason: `host "${hostname}" is not in bricks.dataSources.allowedHosts`,
        };
    }

    return { allowed: true };
}
