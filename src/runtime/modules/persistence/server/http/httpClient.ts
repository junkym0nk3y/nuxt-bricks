/**
 * The HTTP client of the external data backend (`bricks.backend.mode = 'external'`).
 *
 * The server-to-server transport of HttpStorageAdapter: builds the headers from
 * scratch (the browser identity — the `bricks-session` cookie, the Basic
 * credentials — is NOT forwarded), adds `Authorization: Bearer <token>` when
 * NUXT_BRICKS_BACKEND_TOKEN is set, bounds every request by a timeout through an
 * AbortSignal and follows no redirects (redirect: 'error' — a silent change of
 * method or host is unacceptable).
 *
 * Response errors are normalized into a BricksBackendRequestError with the status
 * and a leniently parsed conflict code (a `data.code` in the format of the local
 * toPageHttpError, with a fallback to the top-level `code`); mapping them onto the
 * domain errors is the adapter's duty (httpStorageAdapter.ts).
 */
import { joinURL } from 'ufo';

// #region Types
export interface IBackendHttpClientOptions {
    /** Full base prefix of the external backend's bricks API (bricks.backend.url). */
    baseUrl: string;
    /** Bearer token of the server-to-server requests (NUXT_BRICKS_BACKEND_TOKEN). */
    token?: string;
    /** One request's timeout in milliseconds. */
    timeoutMs?: number;
}

type TBackendHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface IBackendHttpClient {
    /**
     * Runs a JSON request over a path relative to baseUrl and returns the parsed
     * body (null — for an empty response/204).
     */
    request(method: TBackendHttpMethod, path: string, body?: unknown): Promise<unknown>;
    /**
     * The GET readiness probe: reject — when the response is not 2xx or the request
     * failed.
     */
    probeHealth(healthUrl?: string): Promise<void>;
}
// #endregion

// #region Constants
/**
 * The default timeout of a request to the external backend (the module's convention —
 * 10 s).
 */
const DEFAULT_BACKEND_TIMEOUT_MS = 10_000;
// #endregion

/**
 * An error of the external backend's response: the upstream HTTP status + the
 * machine-readable refusal code from the body (`data.code` ?? `code`), when the
 * backend sent one.
 *
 * The code is called `errorCode` rather than `conflictCode`: it is read out of ANY
 * non-2xx response, and it identifies not only the pages' 409 conflicts but domain
 * 400s as well (a missing media category).
 *
 * The status field is deliberately called `upstreamStatus` and NOT `statusCode`:
 * toHttpError (handlerHelpers) rethrows objects carrying a `statusCode` as ready H3
 * errors — the upstream statuses (a 401 of a wrong Bearer, a 5xx of the backend's)
 * would become browser-facing and would bypass the generic 500 envelope with its
 * errorId. Only the contract values the adapter maps explicitly make it outward:
 * a 404 → null/false, a 409 → the domain conflict errors.
 */
export class BricksBackendRequestError extends Error {
    readonly upstreamStatus: number;
    readonly errorCode: string | null;

    constructor(upstreamStatus: number, errorCode: string | null, message: string) {
        super(message);
        this.name = 'BricksBackendRequestError';
        this.upstreamStatus = upstreamStatus;
        this.errorCode = errorCode;
    }
}

// #region Helpers
/**
 * Leniently pulls the machine-readable refusal code from the error's body: the
 * local handlers' format (`data.code`) with a fallback to the top-level `code`.
 *
 * @param body - The parsed JSON body of the error (can be anything).
 * @returns The string code, or null.
 */
function extractErrorCode(body: unknown): string | null {
    if (!body || typeof body !== 'object') {
        return null;
    }

    const data = (body as { data?: unknown }).data;

    if (data && typeof data === 'object') {
        const nestedCode = (data as { code?: unknown }).code;

        if (typeof nestedCode === 'string') {
            return nestedCode;
        }
    }

    const topLevelCode = (body as { code?: unknown }).code;

    return typeof topLevelCode === 'string' ? topLevelCode : null;
}

/**
 * Reads the response body as JSON best-effort (a non-JSON/empty body → null).
 *
 * @param response - The fetch response.
 * @returns The parsed body, or null.
 */
async function parseJsonSafely(response: Response): Promise<unknown> {
    try {
        const text = await response.text();

        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}
// #endregion

/**
 * Creates the HTTP client of the external data backend.
 *
 * @param options - baseUrl/token/timeout from runtimeConfig (see registry.ts).
 * @returns The transport for HttpStorageAdapter.
 */
export function createBackendHttpClient(options: IBackendHttpClientOptions): IBackendHttpClient {
    const timeoutMs = options.timeoutMs ?? DEFAULT_BACKEND_TIMEOUT_MS;

    /**
     * Checks that the base URL is configured and returns it.
     */
    function requireBaseUrl(): string {
        if (!options.baseUrl) {
            throw new Error(
                '[Bricks Backend] backend.url is not configured. ' +
                    'Set bricks.backend.url in nuxt.config or NUXT_BRICKS_BACKEND_URL ' +
                    'before the server starts (bricks.backend.mode = "external").'
            );
        }

        return options.baseUrl;
    }

    /**
     * Builds the request headers from scratch: the browser identity is not forwarded.
     */
    function buildHeaders(hasBody: boolean): Record<string, string> {
        const headers: Record<string, string> = { accept: 'application/json' };

        if (options.token) {
            headers.authorization = `Bearer ${options.token}`;
        }

        if (hasBody) {
            headers['content-type'] = 'application/json';
        }

        return headers;
    }

    /**
     * Runs a fetch with a timeout and a contextual error for a network failure.
     */
    async function fetchWithTimeout(
        url: string,
        method: TBackendHttpMethod,
        body: unknown
    ): Promise<Response> {
        try {
            return await fetch(url, {
                method,
                headers: buildHeaders(body !== undefined),
                body: body !== undefined ? JSON.stringify(body) : undefined,
                redirect: 'error',
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : String(error);

            throw new Error(
                `[Bricks Backend] ${method} ${url} failed: ${reason} (timeout ${timeoutMs}ms)`,
                { cause: error }
            );
        }
    }

    return {
        /**
         * A JSON request over a path relative to baseUrl. The external backend's
         * response is a trusted operator source (the same level as our own
         * database): the body is parsed by an ordinary JSON.parse, and the top-level
         * keys are normalized by the adapter (toCamelCaseShallow — the prototype is
         * not inherited).
         */
        async request(method: TBackendHttpMethod, path: string, body?: unknown): Promise<unknown> {
            const url = joinURL(requireBaseUrl(), path);
            const response = await fetchWithTimeout(url, method, body);

            if (!response.ok) {
                const errorBody = await parseJsonSafely(response);

                throw new BricksBackendRequestError(
                    response.status,
                    extractErrorCode(errorBody),
                    `[Bricks Backend] ${method} ${url} responded HTTP ${response.status}`
                );
            }

            if (response.status === 204) {
                return null;
            }

            const text = await response.text();

            if (!text) {
                return null;
            }

            try {
                return JSON.parse(text) as unknown;
            } catch (error: unknown) {
                throw new Error(`[Bricks Backend] ${method} ${url} responded with invalid JSON`, {
                    cause: error,
                });
            }
        },

        /**
         * The GET readiness probe: the configured health URL, or the contract's base
         * URL (`GET {base}` — listPages). Readiness is a 2xx only.
         */
        async probeHealth(healthUrl?: string): Promise<void> {
            const url = healthUrl || joinURL(requireBaseUrl(), '');
            const response = await fetchWithTimeout(url, 'GET', undefined);
            // The probe's body is never used — the stream is released
            await response.body?.cancel().catch(() => undefined);

            if (!response.ok) {
                throw new BricksBackendRequestError(
                    response.status,
                    null,
                    `[Bricks Backend] health probe ${url} responded HTTP ${response.status}`
                );
            }
        },
    };
}
