// #region Imports
// Types
import type { TPublicRequestOptions } from '../types/render';

// Utils
import {
    applyApiRequestTimeout,
    normalizeRequestAbortError,
} from '../../common/utils/apiRequestPolicy';

// Constants
import { BRICKS_API_READ_TIMEOUT_MS } from '../../common/constants/apiTimeouts';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

// #region Methods
/**
 * Resolves the base URL for public read-model requests.
 * SSR: a relative `app.baseURL` — the server-side `$fetch` (Nitro) serves
 * relative requests by calling the handler internally (through the /api/* proxy
 * middleware as well), without building an origin out of the Host header.
 * Client: `origin + app.baseURL` — straight under the base, no 302 base redirect.
 *
 * @param appBaseURL - The application's `app.baseURL`.
 * @param isServer - Whether the code runs on the server (SSR).
 * @param origin - `window.location.origin` (on the client only).
 */
export function resolvePublicPageBaseUrl(
    appBaseURL: string,
    isServer: boolean,
    origin?: string
): string {
    const basePath = appBaseURL.endsWith('/') ? appBaseURL : `${appBaseURL}/`;

    if (isServer) {
        return basePath;
    }

    return `${origin ?? ''}${basePath}`;
}
// #endregion

/**
 * A separate HTTP client for the published page lookup (the live render path) —
 * the visitor's public context, and the policies deliberately differ from
 * useApiClient (the builder client): no forwarding of cookies and x-forwarded-*
 * (the visitor's identity does not leak into an external backend), no CSRF, no
 * 401 redirect to login (an error of a public lookup must not send the visitor to
 * the builder's login page — it turns into a 404), with a timeout and without
 * retries (a deterministic SSR). The pattern is useDataSourceClient.
 *
 * The lookup goes to `/api/bricks/**`, and those handlers are local in every
 * backend mode: the dev proxy never sends them to PROXY_URL, and under
 * `bricks.backend.mode: 'external'` it is the local handler that walks to the
 * consumer backend, through the storage adapter. On SSR such a call is an
 * internal Nitro one; on the client the request goes out under `app.baseURL`.
 *
 * @returns The public read-model fetcher.
 */
export function usePublicPageClient() {
    const config = useRuntimeConfig();
    const appBaseURL = (config.app?.baseURL as string | undefined) || '/';

    const baseURL = resolvePublicPageBaseUrl(
        appBaseURL,
        Boolean(import.meta.server),
        import.meta.client ? window.location.origin : undefined
    );

    // There is deliberately no ceiling in the instance options: the wrapper below
    // sets it, and keeping a second declaration of the same budget would mean
    // giving the two a chance to drift apart
    const rawPublicPageFetcher = globalThis.$fetch.create({
        baseURL,
        retry: 0,
        // Public context: the page lookup has no use for the visitor's cookies
        credentials: 'omit',
    });

    /**
     * Performs the lookup with a waiting ceiling over both phases of the response.
     *
     * The `timeout` option in the request is only a declaration of the budget:
     * ofetch clears its timer on the headers, and a hung body would keep the
     * visitor waiting without a bound. The policy turns the budget into a live
     * signal, and `normalizeRequestAbortError` gives the abort a recognizable name
     * where the platform has lost it (the browser during the body-reading phase).
     * Through `.raw`, because on a variable URL inferring the response type over
     * the Nitro routes runs into the compiler's recursion limit.
     *
     * @param request - Request path.
     * @param options - Request options.
     * @returns The response body.
     */
    async function publicPageFetcher<T = unknown>(
        request: string,
        options: TPublicRequestOptions = {}
    ): Promise<T> {
        const requestOptions: TPublicRequestOptions = {
            // The shared read ceiling, not a constant of the client's own: with a
            // second copy of the same number, raising the budget here would start
            // being cut short by the external SSR deadline, which takes exactly
            // this constant, and a real server error would turn into a 504.
            //
            // On SSR the ceiling is inert in every backend mode: the lookup goes to
            // a local `/api/bricks/**` handler, that is, an internal Nitro call
            // (`fetchNodeRequestHandler`), and it does not listen to an
            // `AbortSignal`. The bound there is the external deadline around the
            // lookup (`bricks-page-layout.global.ts`), and the further hop to a
            // consumer backend carries a ceiling of its own inside the storage
            // adapter (`persistence/server/http/httpClient.ts`). This ceiling is
            // what works on the client.
            timeout: BRICKS_API_READ_TIMEOUT_MS,
            ...options,
        };
        const effectiveSignal = applyApiRequestTimeout(request, requestOptions);

        try {
            const response = await rawPublicPageFetcher.raw(request, requestOptions);

            return response._data as T;
        } catch (error: unknown) {
            throw normalizeRequestAbortError(error, effectiveSignal);
        }
    }

    return {
        publicPageFetcher,
    };
}
