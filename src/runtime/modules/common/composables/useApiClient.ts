// #region Imports
// Types
import type { IUseApiClientReturn, TApiRequestOptions } from '../types/composables';

// Utils
import {
    applyApiRequestTimeout,
    CLIENT_OWNED_REQUEST_OPTIONS,
    normalizeRequestAbortError,
} from '../utils/apiRequestPolicy';
import { isLocalApiRequest } from '../utils/localApiPaths';
import {
    pickForwardedHeaders,
    pickIdentityHeaders,
    toExternalHeaders,
} from '../utils/ssrRequestHeaders';

// Constants
import { BRICKS_CSRF_HEADER_NAME } from '../constants/auth';

// Composables
import { useBricksRoutePaths } from './useBricksRoutePaths';

// Nuxt
import { useCookie, useRequestEvent, useRuntimeConfig } from '#imports';
// #endregion

// #region Methods
/**
 * Returns the base URL of the Nuxt server for the local endpoints.
 * SSR: a relative `app.baseURL` — the server-side `$fetch` (Nitro) runs
 * relative requests by calling the handler internally, without the network and
 * without building an origin out of the Host header (host spoofing).
 * Client: `origin + app.baseURL` — straight under the base, with no 302 base
 * redirect (a GET survives the redirect, a POST turns into a GET and breaks).
 *
 * @param appBaseURL - The application's `app.baseURL`.
 */
function resolveLocalBaseUrl(appBaseURL: string): string {
    const basePath = appBaseURL.endsWith('/') ? appBaseURL : `${appBaseURL}/`;

    if (import.meta.server) {
        return basePath;
    }

    return `${window.location.origin}${basePath}`;
}
// #endregion

/**
 * Composable for working with the builder API.
 *
 * Request routing (see common/utils/localApiPaths.ts — the predicate shared with
 * the server-side devProxy routing):
 * - /api/bricks/** — always local Nitro routes
 *   (persistence is chosen by bricks.backend.mode, not by the request address)
 * - all other /api/* — the host project's API (server-only bricksProxyUrl),
 *   on the client through the dev proxy middleware
 *
 * Supports:
 * - CSRF token from a cookie (for a REST backend)
 * - Header forwarding on SSR (x-forwarded-*, the request IP and identity —
 *   session cookie and Authorization); identity goes to the local
 *   `/api/bricks/**` ONLY (common/utils/ssrRequestHeaders.ts)
 * - credentials: 'include' so cookies are sent automatically on the client
 *
 * Built on the Nuxt/Nitro `$fetch` (globalThis): on SSR relative URLs are served
 * by calling the Nitro handlers internally (without the network).
 */
export function useApiClient(): IUseApiClientReturn {
    const config = useRuntimeConfig();
    const { builderLoginPath, withBase, stripBase } = useBricksRoutePaths();

    // Forwarding of headers from the SSR request (x-forwarded-*, IP, request identity)
    const event = useRequestEvent();

    const appBaseURL = (config.app?.baseURL as string | undefined) || '/';
    const localBaseUrl = resolveLocalBaseUrl(appBaseURL);

    let endpoint = localBaseUrl;

    if (import.meta.server) {
        // SSR: the host project's API if one is configured (a server-only key —
        // the address never reaches the client payload). Local endpoints are
        // served by calling Nitro internally (see applyLocalApiRouting).
        const proxyEndpoint = config.bricksProxyUrl as string | undefined;

        if (proxyEndpoint) {
            endpoint = proxyEndpoint;
        }
    }

    const headers = pickForwardedHeaders(event?.node?.req?.headers);
    // The client's default headers carry NO identity — no matter whether an
    // external endpoint is configured or not: defaults go out with every request,
    // including one to an absolute URL on a foreign origin (ofetch does not apply
    // the baseURL to it, but it does apply the headers). Identity is added
    // per-address, to requests hitting the local endpoints — see
    // applyLocalApiRouting
    const defaultHeaders = toExternalHeaders(headers);

    // CSRF token of the host project from its cookie (`csrftoken` → `X-CSRFToken`)
    const csrf = useCookie('csrftoken');
    if (csrf.value) {
        defaultHeaders['X-CSRFToken'] = csrf.value as string;
    }

    // CSRF marker of unsafe bricks-API requests: a cross-origin document cannot
    // set a custom header without a CORS preflight (see csrfProtection.ts)
    defaultHeaders[BRICKS_CSRF_HEADER_NAME] = '1';

    // Built on the Nitro-typed $Fetch (globalThis): on SSR it serves relative
    // URLs by calling the handlers internally
    const rawApiFetcher = globalThis.$fetch.create({
        baseURL: endpoint,
        credentials: 'include', // So cookies are sent automatically on the client
        headers: defaultHeaders, // For header forwarding on SSR
        // No retries: the ofetch default repeats 408/409/425/429/5xx instantly,
        // without backoff and without honoring Retry-After — that is not a policy
        // but an accident. Should retries ever be needed, introduce them
        // deliberately: idempotent reads only, with a delay and a shared budget
        // for all the attempts
        retry: 0,
        onResponseError({ response }) {
            // Database auth: a dead session → a full reload onto the login page
            // (it resets the stores cleanly; we are outside a guaranteed Nuxt
            // context). The login page itself is skipped — otherwise a 401 from
            // auth/me would loop the redirect.
            if (import.meta.server) {
                return;
            }

            const isDatabaseAuth =
                (config.public?.bricksAuthMode as string | undefined) === 'database';
            const { pathname, search } = window.location;
            // location.pathname carries the app.baseURL; the redirect parameter is
            // a logical path (after the login it goes into navigateTo, where the
            // router adds the base)
            const logicalPath = stripBase(pathname);

            if (!isDatabaseAuth || response.status !== 401 || logicalPath === builderLoginPath) {
                return;
            }

            window.location.assign(
                withBase(builderLoginPath + '?redirect=' + encodeURIComponent(logicalPath + search))
            );
        },
    });

    /**
     * Adjusts the request options for the local endpoints: `/api/bricks/**` go
     * to the Nuxt server regardless of the persistence mode (which matters for
     * SSR with a PROXY_URL) and receive the identity of the incoming SSR request
     * — the full cookie (the builder session) and `Authorization` (the basic-mode
     * credentials). Without identity the editorial API answers them with a 401,
     * and it is protected in its entirety.
     *
     * Lives in the wrapper rather than in the client's `onRequest` hook because
     * ofetch assembles the call options as `{ ...defaults, ...call }`: an
     * `onRequest` passed by the caller REPLACES the client's hook entirely
     * (verified on ofetch 1.5.1), and the routing along with the identity would
     * silently disappear. The caller's own hook is not supported at all — it runs
     * after the wrapper and could steer an already authorized request to a
     * foreign origin (see `TApiRequestOptions` and the key being stripped in
     * `apiFetcher`).
     *
     * The caller's headers are preserved: identity is set on top of them
     * selectively, and the ofetch client mixes in its defaults itself.
     *
     * @param request - Request path or URL.
     * @param requestOptions - Copy of the request options (mutated).
     */
    function applyLocalApiRouting(request: string, requestOptions: TApiRequestOptions): void {
        if (!isLocalApiRequest(request)) {
            return;
        }

        requestOptions.baseURL = localBaseUrl;

        // No early return on an empty identity: switching the endpoint must not
        // depend on whether the request carries authorization. The public
        // endpoints (`components`, health) carry none, and with a PROXY_URL
        // configured such a request would go to the host project's API instead of
        // the local handler
        const mergedHeaders = new Headers(requestOptions.headers);

        Object.entries(pickIdentityHeaders(headers)).forEach(([name, value]) => {
            mergedHeaders.set(name, value);
        });

        requestOptions.headers = mergedHeaders;
    }

    /**
     * Runs the request with a waiting ceiling and a recognizable abort.
     *
     * The ceiling is set here rather than in `onRequest` because telling that it
     * has fired is only possible when the signal is known: in the browser, an
     * abort while the body is being read makes the platform substitute the error
     * with an `AbortError` and the reason is lost
     * (`normalizeRequestAbortError` recovers it from the signal's `reason`).
     *
     * The options are copied: the caller is free to reuse a single options object
     * for several requests, while the signal belongs to each of them — a shared
     * object would inherit the already fired signal of the first request.
     *
     * @param request - Request path or URL.
     * @param options - Request options.
     * @returns Response body.
     */
    async function apiFetcher<T = unknown>(
        request: string,
        options: TApiRequestOptions = {}
    ): Promise<T> {
        const requestOptions: TApiRequestOptions = { ...options };

        // The transport policy belongs to the client: the hooks and the retries
        // are stripped, otherwise the caller steers an already authorized request
        // to a foreign address — `onRequest` before it is sent, the remaining
        // hooks together with a call-level `retry` before a repeat (the repeat
        // carries the same headers, identity included)
        CLIENT_OWNED_REQUEST_OPTIONS.forEach((option) => {
            Reflect.deleteProperty(requestOptions, option);
        });

        applyLocalApiRouting(request, requestOptions);
        const effectiveSignal = applyApiRequestTimeout(request, requestOptions);

        try {
            // Through `.raw` rather than a direct call: the wrapper passes the URL
            // in a variable, and on it the response type inference for the Nitro
            // routes unfolds into conditional types beyond the compiler's
            // recursion limit. The response body is the same one — a direct ofetch
            // call returns exactly the `_data` of this response. The type is stated
            // by the caller through the generic, as it was before the wrapper
            const response = await rawApiFetcher.raw(request, requestOptions);

            return response._data as T;
        } catch (error: unknown) {
            throw normalizeRequestAbortError(error, effectiveSignal);
        }
    }

    return {
        apiFetcher,
    };
}
