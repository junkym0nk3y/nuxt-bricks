/**
 * Redaction of data source log payloads for production (pure functions).
 *
 * A resolved data source URL contains the substituted parameters (values from
 * component props and page settings), and a raw ofetch error contains the
 * request, the response and the options in full. In production neither of the
 * two reaches the logs: the URL is folded down to the target (`local` / origin),
 * the error down to allow-listed fields. Detailed payloads stay in the dev
 * branches (`import.meta.dev`) of the composable.
 */

// #region Types
/** Allow-list of data source error fields for the production log. */
export interface IDataSourceLogError {
    name: string;
    statusCode?: number;
}
// #endregion

/**
 * Folds a resolved data source URL down to a safe target for the log:
 * a relative path → `'local'`, anything the URL parser accepts → its origin
 * alone, everything else → `'invalid-url'`. A protocol-relative `//host` ends up
 * in that last case because the parser rejects it without a base, and so do the
 * schemes with an opaque origin — `mailto:`, `javascript:`, `file:` — whose
 * origin comes back as the string `'null'`.
 *
 * The scheme is not filtered here: `ftp://host/x` reaches the log as `ftp://host`.
 * This is a log target, not a gate; the gate is `checkDataSourceUrl`, and it
 * admits http(s) only.
 *
 * @param url - Resolved request URL (after parameter substitution).
 * @returns The request target without path/query/parameters.
 */
export function resolveDataSourceLogTarget(url: string): string {
    if (!url) {
        return 'invalid-url';
    }

    if (url.startsWith('/') && !url.startsWith('//')) {
        return 'local';
    }

    try {
        const parsed = new URL(url);
        return parsed.origin === 'null' ? 'invalid-url' : parsed.origin;
    } catch {
        return 'invalid-url';
    }
}

/**
 * Extracts the numeric HTTP status from a fetch client error (statusCode/status/
 * response.status — the fields of FetchError and compatible errors).
 *
 * @param error - Data source request error.
 * @returns The response status, or undefined when there is none.
 */
function extractStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const candidate = error as {
        statusCode?: unknown;
        status?: unknown;
        response?: { status?: unknown };
    };
    const value = candidate.statusCode ?? candidate.status ?? candidate.response?.status;

    return typeof value === 'number' ? value : undefined;
}

/**
 * Reduces an arbitrary data source request error to the allow-listed fields for
 * the production log: the error class name and the HTTP status. message/request/
 * response/options are deliberately left out (they contain the URL with the
 * parameters and the response body).
 *
 * @param error - Data source request error.
 * @returns Redacted representation of the error.
 */
export function toDataSourceLogError(error: unknown): IDataSourceLogError {
    const name = error instanceof Error ? error.name : typeof error;
    const statusCode = extractStatusCode(error);

    return statusCode === undefined ? { name } : { name, statusCode };
}
