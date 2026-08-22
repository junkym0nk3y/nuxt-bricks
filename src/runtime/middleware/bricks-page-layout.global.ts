import type { LayoutKey } from 'nuxt/app';
import { defineNuxtRouteMiddleware, useNuxtApp, setPageLayout } from '#app';
import { createError, useState, useRequestHeaders, useRuntimeConfig } from '#imports';
import type {
    IPageVersion,
    IPublishedPage,
    TPublishedPageSummary,
} from '../modules/common/types/bricks-api';
import { normalizeBricksError, parseBricksBooleanFlag } from '../modules/common/utils/main';
import { isRequestTimeoutError } from '../modules/common/utils/apiRequestPolicy';
import { useApiClient } from '../modules/common/composables/useApiClient';
import { usePublicPageClient } from '../modules/render/composables/usePublicPageClient';
import { withPageLookupDeadline } from '../modules/render/utils/pageLookupDeadline';
import { toCamelCase } from '../modules/common/utils/case-transform';
import { BRICKS_PREVIEW_ROUTE_NAMES } from '../modules/common/constants/routes';
import {
    matchesPageSubdomain,
    normalizePageVersionPreview,
    normalizePublishedPage,
} from '../modules/common/utils/bricks/publishedPage';
import {
    getPageAddressKey,
    isSamePageAddress,
    resolvePageAddressFromRoute,
    toPageAddress,
} from '../modules/common/utils/bricks/pageAddress';
import {
    PREVIEW_VERSION_QUERY_PARAM,
    getBricksPageDataKey,
    parsePreviewVersionId,
} from '../modules/common/utils/bricks/previewRoute';

/**
 * The status of an unresponsive backend. A lookup timeout is not "there is no
 * such page": a 404 for it would be cached by the CDN and understood by a crawler
 * as the page being gone.
 */
const HTTP_GATEWAY_TIMEOUT = 504;

/**
 * Bounds the SSR page lookup in time (the policy itself lives in the utility).
 *
 * @param operation - The lookup promise.
 * @returns The lookup promise with a deadline on SSR.
 */
function withLookupDeadline<T>(operation: Promise<T>): Promise<T> {
    return withPageLookupDeadline(operation, Boolean(import.meta.server));
}

/**
 * Returns the status under which a failed lookup reaches the visitor.
 *
 * @param error - The lookup error.
 * @param fallbackStatus - Status of an ordinary failure.
 * @returns The HTTP status.
 */
function resolveLookupErrorStatus(error: unknown, fallbackStatus: number): number {
    return isRequestTimeoutError(error) ? HTTP_GATEWAY_TIMEOUT : fallbackStatus;
}

/**
 * Middleware that sets the layout dynamically from the stored page data (whichever
 * backend mode holds it).
 * It applies to the landing pages:
 * - `<previewPrefix>/[pagename]` and `<previewPrefix>/[...urlPrefix]/[pagename]`
 *   (the built-in preview routes, always in preview mode)
 * - /[pagename] and /[...urlPrefix]/[pagename] (the static catch-all routes
 *   bricks-page/bricks-page-prefixed from module-setup.ts, live mode)
 *
 * The mode is decided by the route alone: the query `?preview=true` is not used.
 * A live page is resolved by a direct lookup of the public read-model by address;
 * the subdomain is checked against the actual URL right here.
 */
// eslint-disable-next-line complexity
export default defineNuxtRouteMiddleware(async (to) => {
    // Applies to a preview route or to the dynamic slug routes of published pages
    const isPreview = typeof to.name === 'string' && BRICKS_PREVIEW_ROUTE_NAMES.includes(to.name);
    const isDirectBricksRoute = to.meta?.isPublishedBricksPage === true;

    if (!isPreview && !isDirectBricksRoute) {
        return;
    }

    const nuxtApp = useNuxtApp();
    // An address rather than a name alone: the editor, the preview and the live
    // render each serve a pair of routes (with a prefix and without), and pages of
    // the same name under different prefixes are different pages
    const address = resolvePageAddressFromRoute(to.params);

    // The preview version lives in the URL: the payload key has to account for it,
    // otherwise a second version of the same page would pick up the data of the first
    const previewVersionId = isPreview
        ? parsePreviewVersionId(to.query[PREVIEW_VERSION_QUERY_PARAM])
        : null;

    const pageDataKey = getBricksPageDataKey(address, isPreview, previewVersionId);

    // Try the payload first, in case this middleware has already loaded the data.
    // This covers client-side navigation, where the middleware may run a second time
    let page: IPublishedPage | null = nuxtApp.payload.data[pageDataKey] as IPublishedPage | null;

    if (!page) {
        // The localStorage snapshot is only for previewing the current state of the
        // canvas (that state is not in the database). A version preview has a single
        // source — the server, by `?version=` — and substituting the live snapshot
        // for it would show the builder's canvas instead of the history
        if (isPreview && previewVersionId === null && import.meta.client) {
            const previewData = window.localStorage.getItem('bricks-preview-page');

            if (previewData) {
                const tempPage = JSON.parse(previewData) as IPublishedPage;

                // The address is compared, not the name: there is one preview slot
                // per builder, and otherwise the snapshot of `/blog/post` would
                // show up in the preview of `/news/post` as if it were its own
                if (
                    isSamePageAddress(toPageAddress(tempPage.pagename, tempPage.urlPrefix), address)
                ) {
                    page = tempPage;
                }
            }
        }

        // If nothing came from localStorage (or this is not a preview), go to the API
        if (!page && isPreview) {
            // Preview is an authorized scenario (the auth matrix protects the whole
            // previewPrefix, every role included): the search covers every page,
            // drafts included, through the editorial API (the authenticated builder
            // client: the builder's session cookie, a 401 redirect to login)
            const { apiFetcher } = useApiClient();
            const pagesList = useState<TPublishedPageSummary[]>('bricks-all-pages', () => []);

            if (!pagesList.value.length) {
                try {
                    const response = await withLookupDeadline(
                        apiFetcher<TPublishedPageSummary[]>('/api/bricks/')
                    );
                    pagesList.value = toCamelCase<TPublishedPageSummary[]>(response);
                } catch (error) {
                    return createError(
                        normalizeBricksError(
                            error,
                            'Failed to load pages list',
                            resolveLookupErrorStatus(error, 500)
                        )
                    );
                }
            }

            const targetPage = pagesList.value.find((candidate) =>
                isSamePageAddress(toPageAddress(candidate.pagename, candidate.urlPrefix), address)
            );

            if (!targetPage) {
                // A version exists only together with the page row, and there is
                // nothing on the client to pick it up with: an empty preview would
                // read as "the version is empty"
                if (previewVersionId !== null) {
                    return createError({
                        statusCode: 404,
                        statusMessage: 'Page not found',
                    });
                }

                // A draft may live in localStorage alone (unavailable on the server).
                // No 404 here — the page picks the data up from localStorage on the
                // client itself.
                return;
            }

            try {
                if (previewVersionId === null) {
                    const response = await withLookupDeadline(
                        apiFetcher<IPublishedPage>(`/api/bricks/${targetPage.id}/`)
                    );
                    page = normalizePublishedPage(response);
                } else {
                    // The version snapshot arrives from the server rather than from
                    // localStorage: there is a single slot there, and a builder open
                    // alongside would overwrite it with its live schema
                    const response = await withLookupDeadline(
                        apiFetcher<IPageVersion>(
                            `/api/bricks/${targetPage.id}/versions/${previewVersionId}/`
                        )
                    );
                    page = normalizePageVersionPreview(response, targetPage);
                }
            } catch (error) {
                return createError(
                    normalizeBricksError(
                        error,
                        previewVersionId === null
                            ? 'Failed to load page'
                            : 'Failed to load page version',
                        resolveLookupErrorStatus(error, 500)
                    )
                );
            }
        }

        if (!page && !isPreview) {
            // Live is the public read-model: a direct lookup by address, without
            // list+find. The public client: no cookie, no CSRF, no 401 redirect — a
            // lookup error will not send the visitor to the builder's login. Its own
            // timeout is inert on SSR, the ceiling is held by the external deadline
            // (`withLookupDeadline`)
            const { publicPageFetcher } = usePublicPageClient();

            try {
                // The address travels as the tail of the path
                // (`public/pages/blog/post`): the segments of the key have already
                // passed `PAGE_ROUTE_SEGMENT`, so there is nothing left to encode —
                // while encoding the whole key would turn the separator into `%2F`
                const response = await withLookupDeadline(
                    publicPageFetcher<IPublishedPage>(
                        `/api/bricks/public/pages/${getPageAddressKey(address)}/`
                    )
                );
                page = normalizePublishedPage(response);
            } catch (error) {
                return createError(
                    normalizeBricksError(
                        error,
                        'Page not found',
                        resolveLookupErrorStatus(error, 404)
                    )
                );
            }
        }
        // Store the data in the payload so the page component does not load it again
        (nuxtApp.payload.data as Record<string, unknown>)[pageDataKey] = page;
    }

    // Live: the catch-all route matches any URL of a fitting shape — the page
    // address and the subdomain are checked against the actual URL on every
    // navigation.
    //
    // The lookup is already by address, and the built-in adapter cannot return
    // someone else's address, but the contract of an external HTTP backend is
    // unverifiable: it is free to ignore the prefix in the path and answer with the
    // page of that name alone. This comparison is then the only thing that keeps a
    // foreign page from being rendered under a foreign URL.
    if (page && !isPreview) {
        if (!isSamePageAddress(toPageAddress(page.pagename, page.urlPrefix), address)) {
            return createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        if (page.subdomain) {
            let currentHost = '';

            if (import.meta.server) {
                // Behind a trusted proxy the Host is the address of the proxy; the
                // original host is the last non-empty token of x-forwarded-host
                // (appended by the nearest proxy hop, the pattern of
                // requestClientIp.ts; opt-in bricks.trustProxy)
                const headers = useRequestHeaders(['host', 'x-forwarded-host']);
                const trustProxy = parseBricksBooleanFlag(useRuntimeConfig().bricksTrustProxy);
                const forwardedHost = trustProxy
                    ? headers['x-forwarded-host']
                          ?.split(',')
                          .map((entry) => entry.trim())
                          .filter(Boolean)
                          .at(-1)
                    : undefined;
                currentHost = forwardedHost || headers.host || '';
            } else {
                currentHost = window.location.hostname;
            }

            if (!matchesPageSubdomain(currentHost, page.subdomain)) {
                return createError({
                    statusCode: 404,
                    statusMessage: 'Page not found',
                });
            }
        }
    }

    if (page) {
        const layout = page.layout || 'default';
        try {
            setPageLayout(layout as LayoutKey);
        } catch (error) {
            console.warn('[Bricks Middleware] Failed to apply layout:', layout, error);
        }
    } else if (!isPreview && !page) {
        // Unreachable under the current control flow: a live lookup either fills
        // `page` or returns an error of its own, and a preview without a page row
        // has already returned above. Kept as the last resort of a route that
        // matches any URL of a fitting shape.
        return createError({
            statusCode: 404,
            statusMessage: 'Page not found',
        });
    }
});
