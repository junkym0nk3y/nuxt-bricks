/**
 * The preview routes `<previewPrefix>/:pagename` and
 * `<previewPrefix>/:urlPrefix+/:pagename`: the version parameter, the payload key
 * of the page and the render page key. They live together because the version is
 * part of all three: the middleware and the render page have to agree on one
 * payload key, otherwise a version preview either misses the loaded data or picks
 * up the snapshot of a neighboring version.
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { IBricksPageAddress } from '../../types/pageAddress';
import { getPageAddressKey } from './pageAddress';
import { BRICKS_PREVIEW_ROUTE_NAMES } from '../../constants/routes';

/**
 * Name of the version query parameter of the preview route. The version lives in
 * the URL rather than in localStorage: there is only one slot there, and a builder
 * tab open alongside (or a second preview) would overwrite the snapshot. Kept in
 * the URL, a version preview survives a reload and is rendered on SSR with the
 * right state straight away.
 */
export const PREVIEW_VERSION_QUERY_PARAM = 'version';

/**
 * Parses the `?version=` of the preview route: a version id, or `null` for the
 * preview of the current state. Garbage (not a number, zero, negative) is treated
 * as the absence of the parameter — the preview shows the page rather than a
 * rejection. A repeated parameter is not garbage: vue-router hands it over as an
 * array and the first value wins, the way a duplicate query key is read
 * everywhere else.
 *
 * @param value - Value of `route.query[PREVIEW_VERSION_QUERY_PARAM]`.
 * @returns A positive integer version id, or null.
 */
export function parsePreviewVersionId(value: unknown): number | null {
    const raw = Array.isArray(value) ? value[0] : value;

    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
        return null;
    }

    const versionId = Number.parseInt(raw, 10);

    return versionId > 0 ? versionId : null;
}

/**
 * Key of the page data in `nuxtApp.payload.data`: the middleware writes it, the
 * render page reads it through `useNuxtData`.
 *
 * The key is built from the ADDRESS rather than from the name alone, and by the
 * same function (`getPageAddressKey`) as the draft keys: by name, `/blog/post` and
 * `/news/post` had one and the same key, and that is not merely a cache collision
 * — on a payload hit the middleware re-checks the prefix and answers a 404 on a
 * mismatch, that is, an SPA navigation between two pages of the same name broke the
 * live page. A second similar serialization of the address is inadmissible here
 * too: drifting away from the draft key, it would put the state of one page under
 * the key of another.
 *
 * @param address - Page address.
 * @param isPreview - Whether this is a preview route (otherwise the live page at the address).
 * @param previewVersionId - Version id from the preview route query (null — the current state).
 * @returns Payload key.
 */
export function getBricksPageDataKey(
    address: IBricksPageAddress,
    isPreview: boolean,
    previewVersionId: number | null = null
): string {
    const addressKey = getPageAddressKey(address);

    if (!isPreview) {
        return `bricks-page-${addressKey}-live`;
    }

    return previewVersionId === null
        ? `bricks-page-${addressKey}-preview`
        : `bricks-page-${addressKey}-preview-version-${previewVersionId}`;
}

/**
 * Page key of the render page (`definePageMeta`).
 *
 * The default Nuxt key is the path without the query, so a navigation between
 * `?version=44` and `?version=45` would reuse the page: the version id, the
 * payload key and the sync mode are captured once in setup, and the tab would stay
 * on the previous version. The version is part of the key on the preview route
 * only: on a live page the parameter means nothing to the render and belongs to the
 * consumer — remounting on its change would reset the state of the page and run the
 * data sources all over again.
 *
 * @param route - The current route (the name, the path and the query are needed).
 * @returns Page key for `<NuxtPage>`.
 */
export function getRenderPageKey(
    route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path' | 'query'>
): string {
    if (typeof route.name !== 'string' || !BRICKS_PREVIEW_ROUTE_NAMES.includes(route.name)) {
        return route.path;
    }

    return `${route.path}:${parsePreviewVersionId(route.query[PREVIEW_VERSION_QUERY_PARAM]) ?? ''}`;
}
