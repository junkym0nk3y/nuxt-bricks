// #region Imports
// Types
import type { IBricksDataSourcesConfig } from '../../common/types/dataSource';
import type { TPublicRequestOptions } from '../types/render';

// Utils
import {
    DEFAULT_DATA_SOURCE_CONCURRENCY,
    DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE,
    DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES,
    DEFAULT_DATA_SOURCE_TIMEOUT_MS,
    DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS,
} from '../utils/dataSourcePolicy';
import {
    DataSourceHttpError,
    readResponseWithinByteBudget,
} from '../utils/dataSourceResponseReading';
import {
    applyApiRequestTimeout,
    normalizeRequestAbortError,
} from '../../common/utils/apiRequestPolicy';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

/**
 * A separate HTTP client for the data sources of a published page — the public
 * render context, and the policies deliberately differ from useApiClient (the
 * builder client): no forwarding of cookies and x-forwarded-* (neither the
 * visitor's nor the builder's identity leaks into an external backend), no CSRF,
 * no 401 redirect to login (an error of a public data source must not send the
 * visitor to the login page), with a timeout and without retries (a deterministic
 * SSR).
 *
 * The per-request ceiling is set by the client itself — by the fetcher wrapper
 * below, through the request policy, and not in an ofetch `onRequest` hook (why
 * the policy stays out of the hooks is spelled out in `useApiClient.ts`). The
 * ceiling has to be in force regardless of whether the caller passed the signal
 * of the run's total deadline, and it has to cover the reading of the body, not
 * the headers alone — the body here is read by hand, as a stream, after the
 * ofetch response has already arrived.
 *
 * A caveat about SSR: on the server a relative URL is served by an internal Nitro
 * call, which does not listen to an `AbortSignal`, so both the request ceiling
 * and the run's total deadline on an `AbortController` are inert there. Such a
 * request is bounded by the `withPromiseDeadline` around the run in
 * `useRendererDataSources`. Absolute URLs from the allow-list and client-side
 * requests do listen to the signal as usual.
 *
 * Request routing is the same as for the rest of the API: on SSR relative URLs
 * are served by an internal Nitro call (through the /api/* proxy middleware as
 * well), on the client — under `app.baseURL`. Absolute URLs are admitted by the
 * dataSourcePolicy (the host allow-list) and go out directly.
 *
 * @returns The fetcher and the execution parameters (allow-list, concurrency
 * limit, budgets for the response size / request count / total deadline).
 */
export function useDataSourceClient() {
    const config = useRuntimeConfig();
    const dataSourcesConfig = config.public.bricksDataSources as
        | Partial<IBricksDataSourcesConfig>
        | undefined;

    const allowedHosts = dataSourcesConfig?.allowedHosts ?? [];
    const timeoutMs = dataSourcesConfig?.timeoutMs ?? DEFAULT_DATA_SOURCE_TIMEOUT_MS;
    const concurrency = dataSourcesConfig?.concurrency ?? DEFAULT_DATA_SOURCE_CONCURRENCY;
    const maxResponseBytes =
        dataSourcesConfig?.maxResponseBytes ?? DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES;
    const maxRequestsPerPage =
        dataSourcesConfig?.maxRequestsPerPage ?? DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE;
    const totalDeadlineMs =
        dataSourcesConfig?.totalDeadlineMs ?? DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS;

    const appBaseURL = (config.app?.baseURL as string | undefined) || '/';
    const basePath = appBaseURL.endsWith('/') ? appBaseURL : `${appBaseURL}/`;
    // SSR: a relative base — an internal Nitro call with no network and no origin
    // built out of Host; client: origin + base (see useApiClient.resolveLocalBaseUrl)
    const baseURL = import.meta.server ? basePath : `${window.location.origin}${basePath}`;

    // There is deliberately no ceiling in the instance options: the fetcher below
    // sets it, and keeping a second declaration of the same budget would mean
    // giving the two a chance to drift apart
    const rawDataSourceFetcher = globalThis.$fetch.create({
        baseURL,
        retry: 0,
        // Public context: data source requests have no use for the visitor's cookies
        credentials: 'omit',
    });

    /**
     * The data source fetcher: HTTP through ofetch (baseURL / no retries), the
     * body through a streaming read with a byte budget applied BEFORE JSON.parse
     * (a large response is cut off while being read, not measured after being
     * buffered and parsed in full).
     *
     * The waiting ceiling is set here: the body is read by hand, after the ofetch
     * response, so the `timeout` option would not have covered it — its timer is
     * cleared on the headers. The policy combines the caller's signal (the run's
     * total deadline) with the ceiling, and `normalizeRequestAbortError` gives the
     * abort a recognizable name where the platform has lost it.
     *
     * @param url - Resolved request URL.
     * @param options - The method and an optional abort signal.
     * @returns The parsed response body.
     * @throws DataSourceResponseTooLargeError once maxResponseBytes is exceeded.
     */
    async function dataSourceFetcher<T>(
        url: string,
        options: { method: 'GET' | 'HEAD'; signal?: AbortSignal }
    ): Promise<T> {
        // ignoreResponseError: the default ofetch throw on 4xx/5xx would leave the
        // body stream unread and not canceled — we handle the status ourselves
        // below, after releasing the stream
        const requestOptions: TPublicRequestOptions = {
            ...options,
            timeout: timeoutMs,
            responseType: 'stream',
            ignoreResponseError: true,
        };
        const effectiveSignal = applyApiRequestTimeout(url, requestOptions);

        try {
            const response = await rawDataSourceFetcher.raw(url, requestOptions);

            if (response.status >= 400) {
                // The error body is not used — cancel the stream instead of reading it
                await response.body?.cancel().catch(() => undefined);
                throw new DataSourceHttpError(response.status);
            }

            return (await readResponseWithinByteBudget(response, maxResponseBytes)) as T;
        } catch (error: unknown) {
            throw normalizeRequestAbortError(error, effectiveSignal);
        }
    }

    // `timeoutMs` is not handed out: the ceiling of a single request is the
    // client's business, the caller is left with the budgets of the run
    return {
        dataSourceFetcher,
        allowedHosts,
        concurrency,
        maxResponseBytes,
        maxRequestsPerPage,
        totalDeadlineMs,
    };
}
