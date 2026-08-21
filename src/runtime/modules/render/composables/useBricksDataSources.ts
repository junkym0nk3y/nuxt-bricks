// #region Imports
// Types
import type {
    IBrickDataSource,
    IBrickDataSourceParam,
    IBrickDataSourceContext,
} from '../../common/types/dataSource';
import type { IBricksComponent } from '../../common/types/brick';
import type { TPublishFormState } from '../../common/types/bricks-api';
import type { TDataSourceRequestCache } from '../types/composables';

// Utils
import {
    checkDataSourceUrl,
    resolveDataSourceMethod,
    type TResolvedDataSourceMethod,
} from '../utils/dataSourcePolicy';
import { DataSourceResponseTooLargeError } from '../utils/dataSourceResponseReading';
import { resolveDataSourceLogTarget, toDataSourceLogError } from '../utils/dataSourceLogging';
import { hasOwnKey } from '../../common/utils/safeRecord';

// Composables
import { useDataSourceClient } from './useDataSourceClient';
// #endregion

/**
 * Composable for working with the data sources of a published page.
 * The requests go through a dedicated public client (useDataSourceClient):
 * no cookies/identity, with a timeout; the URL and the method are checked by the
 * policy (dataSourcePolicy) — relative URLs or the host allow-list, GET/HEAD only.
 *
 * Logs: the details (props, parameters, the full URL, a preview of the response,
 * the raw error) in dev only; in production the URL is folded down to the target
 * (`local`/origin) and the error down to `{ name, statusCode }` (see
 * utils/dataSourceLogging) — the resolved URL contains the substituted values of
 * the props and of the page, and it must not reach the prod logs.
 *
 * @returns The executeDataSource method and the execution budgets (concurrency
 * limit, maximum requests per run, total deadline) from the configuration.
 */
export function useBricksDataSources() {
    // #region Data
    const { dataSourceFetcher, allowedHosts, concurrency, maxRequestsPerPage, totalDeadlineMs } =
        useDataSourceClient();
    // #endregion

    // #region Methods
    /**
     * Extracts a value from an object by a string path.
     * The path is written in a brick file, so the segments are matched by own key:
     * `'constructor' in acc` would have been true and would have returned `Object`.
     *
     * @param source - Source object to extract the value from.
     * @param path - Path to the value in the 'key.nested.value' form.
     * @returns The value at the given path, or undefined when the path is not found.
     *
     */
    function getValueByPath(source: object | null, path: string): unknown {
        if (!path) {
            return undefined;
        }

        return path.split('.').reduce<unknown>((acc, segment) => {
            if (acc && typeof acc === 'object' && hasOwnKey(acc, segment)) {
                return (acc as Record<string, unknown>)[segment];
            }
            return undefined;
        }, source);
    }

    /**
     * Resolves a parameter value out of the component props or the page settings.
     * Supports direct values, paths to data and mapping functions.
     *
     * @param param - Definition of the data source parameter.
     * @param component - Component the parameter is being resolved for.
     * @param pageSettings - Page settings (pagename, title and so on).
     * @returns The resolved parameter value, or undefined.
     */
    function resolveParamValue(
        param: IBrickDataSourceParam,
        component: IBricksComponent,
        pageSettings: TPublishFormState | null
    ): unknown {
        const context: IBrickDataSourceContext = {
            pageSettings,
            componentProps: component.props ?? {},
        };

        if (param.value !== undefined) {
            return param.map ? param.map(param.value, context) : param.value;
        }

        if (!param.from) {
            return undefined;
        }

        const sourceValue = param.from.startsWith('component.')
            ? getValueByPath(component.props ?? {}, param.from.replace('component.', ''))
            : getValueByPath(pageSettings, param.from);

        return param.map ? param.map(sourceValue, context) : sourceValue;
    }

    /**
     * Substitutes parameters into the URL, replacing :paramName with values.
     *
     * The parameter names are declared by a brick file, hence a `Map` as the
     * collection: with an ordinary object `:constructor` would count as found via
     * the prototype, while `:__proto__` could not be represented by an own key at
     * all and the placeholder would stay unresolved.
     *
     * @param url - URL with placeholders of the :paramName form.
     * @param params - The set of parameters to substitute.
     * @returns The URL with the parameter values substituted.
     *
     * @example
     * ```ts
     * buildDataSourceUrl('/api/users/:id', new Map([['id', 123]])); // '/api/users/123'
     * ```
     */
    function buildDataSourceUrl(url: string, params: Map<string, string | number>): string {
        return url.replace(/:([a-zA-Z0-9_]+)/g, (match, key) => {
            if (params.has(key)) {
                return encodeURIComponent(String(params.get(key)));
            }
            return match;
        });
    }

    /**
     * Returns a truncated preview of the result for the dev logs.
     * Caps arrays at 3 elements and objects at 5 keys.
     *
     * @param value - Value to build the preview from.
     * @returns The truncated value to show in the logs.
     */
    function getResponsePreview(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.slice(0, 3);
        }

        if (value && typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>).slice(0, 5);
            return Object.fromEntries(entries);
        }

        return value;
    }

    /**
     * Checks whether unresolved :paramName placeholders are left in the URL.
     * For an absolute URL only path + query is checked (the colons of the scheme
     * and of the port are not placeholders).
     *
     * @param url - URL after parameter substitution.
     * @returns true when an unfilled placeholder is left in the URL.
     */
    function hasUnresolvedParams(url: string): boolean {
        let checkedPart = url;

        if (!url.startsWith('/')) {
            try {
                const parsed = new URL(url);
                checkedPart = `${parsed.pathname}${parsed.search}`;
            } catch {
                // Not an absolute URL — check the whole string (the policy
                // filters it out anyway)
            }
        }

        return checkedPart.includes(':');
    }

    /**
     * Adds the detailed fields to the redacted prod log payload in dev mode.
     * In production returns the payload as it is (the details are not logged).
     *
     * @param payload - The safe payload for the production log.
     * @param devDetails - The detailed fields (url/params/raw error) for dev.
     * @returns The resulting log payload.
     */
    function withDevLogDetails(
        payload: Record<string, unknown>,
        devDetails: Record<string, unknown>
    ): Record<string, unknown> {
        return import.meta.dev ? { ...payload, ...devDetails } : payload;
    }

    /**
     * Performs the data source HTTP request with deduplication by (method + url):
     * identical requests of one run share a single promise.
     *
     * @param url - Resolved request URL.
     * @param method - Normalized HTTP method.
     * @param requestCache - Response cache of the current run (optional).
     * @param signal - Abort signal (the run's total deadline); it is not part of
     * the cache key, so that dedup by (method + url) does not depend on the run.
     * @returns The raw response of the request.
     */
    function fetchDataSource(
        url: string,
        method: TResolvedDataSourceMethod,
        requestCache?: TDataSourceRequestCache,
        signal?: AbortSignal
    ): Promise<unknown> {
        const cacheKey = `${method} ${url}`;
        const cached = requestCache?.get(cacheKey);

        if (cached) {
            return cached;
        }

        // The run's signal goes out as it is: the per-request ceiling is set by the
        // client itself, and it combines the ceiling with this signal itself.
        // Assembling the ceiling a second time here would mean keeping the
        // knowledge of it in two places, and the coverage would depend on whether
        // the run passed a signal
        const responsePromise = dataSourceFetcher<unknown>(url, { method, signal });
        requestCache?.set(cacheKey, responsePromise);

        return responsePromise;
    }

    /**
     * Performs the data source request and returns the mapped result.
     * Collects the parameters, builds the URL, checks the policy (method/URL),
     * performs the request and applies the map function.
     *
     * @param source - Data source definition: the URL, the parameters and the
     * map function.
     * @param component - Component the request is performed for.
     * @param pageSettings - Page settings for resolving the parameters.
     * @param requestCache - Response cache of the current run (dedup of
     * identical requests).
     * @param signal - Abort signal of the run's total deadline; an aborted request
     * lands in the shared catch → null → the component's fallback props.
     * @returns The request result after the map function, or null on an error.
     */
    async function executeDataSource(
        source: IBrickDataSource,
        component: IBricksComponent,
        pageSettings: TPublishFormState | null,
        requestCache?: TDataSourceRequestCache,
        signal?: AbortSignal
    ): Promise<Record<string, unknown> | null> {
        let params = new Map<string, string | number>();
        let url = source.url;

        const method = resolveDataSourceMethod(source.method);

        if (!method) {
            console.warn('[Bricks DataSource] Skip - method is not allowed (GET/HEAD only):', {
                key: source.key,
                method: source.method,
                componentId: component.id,
                brickPath: component.brickPath,
            });
            return null;
        }

        try {
            if (source.params) {
                // The parameter names are declared in a brick file: a Map as the
                // collection, so that no name is lost or read off the prototype
                params = new Map(
                    Object.entries(source.params)
                        .map(
                            ([key, param]) =>
                                [key, resolveParamValue(param, component, pageSettings)] as [
                                    string,
                                    string | number,
                                ]
                        )
                        .filter(([, value]) => value !== undefined && value !== null)
                );
            }

            url = buildDataSourceUrl(source.url, params);

            if (hasUnresolvedParams(url)) {
                console.warn(
                    '[Bricks DataSource] Skip - unresolved params:',
                    withDevLogDetails(
                        {
                            key: source.key,
                            target: resolveDataSourceLogTarget(url),
                            componentId: component.id,
                            brickPath: component.brickPath,
                        },
                        { url, params }
                    )
                );
                return null;
            }

            const urlCheck = checkDataSourceUrl(url, allowedHosts);

            if (!urlCheck.allowed) {
                console.warn(
                    '[Bricks DataSource] Skip - url is not allowed by policy:',
                    withDevLogDetails(
                        {
                            key: source.key,
                            target: resolveDataSourceLogTarget(url),
                            reason: urlCheck.reason,
                            componentId: component.id,
                            brickPath: component.brickPath,
                        },
                        { url }
                    )
                );
                return null;
            }

            if (import.meta.dev) {
                console.info('[Bricks DataSource] Fetching:', {
                    key: source.key,
                    url,
                    method,
                    params,
                    componentId: component.id,
                    brickPath: component.brickPath,
                    componentProps: component.props,
                    page: pageSettings?.pagename,
                });
            }

            // The response byte budget is applied at the fetcher level — the
            // streaming read is cut off before JSON.parse; an overrun arrives here
            // as a DataSourceResponseTooLargeError
            const response = await fetchDataSource(url, method, requestCache, signal);

            if (import.meta.dev) {
                console.info('[Bricks DataSource] Response received:', {
                    key: source.key,
                    url,
                    method,
                    componentId: component.id,
                    brickPath: component.brickPath,
                    responseType: Array.isArray(response) ? 'array' : typeof response,
                    responsePreview: getResponsePreview(response),
                    hasData: Boolean(response),
                });
            }

            const context: IBrickDataSourceContext = {
                pageSettings,
                componentProps: component.props ?? {},
            };

            if (typeof source.map === 'function') {
                const mapped = source.map(response, context);

                if (import.meta.dev) {
                    console.info('[Bricks DataSource] Mapped result:', {
                        key: source.key,
                        componentId: component.id,
                        brickPath: component.brickPath,
                        mappedKeys: mapped ? Object.keys(mapped) : [],
                        mappedPreview: mapped ? getResponsePreview(mapped) : null,
                    });
                }

                return mapped;
            }

            if (Array.isArray(response)) {
                return { data: response };
            }

            if (response && typeof response === 'object') {
                return response as Record<string, unknown>;
            }

            return null;
        } catch (error) {
            if (error instanceof DataSourceResponseTooLargeError) {
                console.warn(
                    '[Bricks DataSource] Skip - response exceeds byte budget:',
                    withDevLogDetails(
                        {
                            key: source.key,
                            target: resolveDataSourceLogTarget(url),
                            responseSizeBytes: error.receivedBytes,
                            maxResponseBytes: error.maxResponseBytes,
                            componentId: component.id,
                            brickPath: component.brickPath,
                        },
                        { url }
                    )
                );
                return null;
            }

            // In production neither the url, nor the params, nor the raw error is
            // logged: the resolved url contains values of the props and of the
            // page, and an ofetch error contains request/response/options in full
            console.error(
                '[Bricks DataSource] Fetch failed:',
                withDevLogDetails(
                    {
                        key: source.key,
                        target: resolveDataSourceLogTarget(url),
                        method,
                        componentId: component.id,
                        brickPath: component.brickPath,
                        error: toDataSourceLogError(error),
                    },
                    { url, params, rawError: error }
                )
            );
            return null;
        }
    }
    // #endregion

    return {
        executeDataSource,
        concurrency,
        maxRequestsPerPage,
        totalDeadlineMs,
    };
}
