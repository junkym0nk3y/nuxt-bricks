/**
 * Address identity of a page: normalization of the `urlPrefix + pagename` pair,
 * its canonical key and the comparison of addresses.
 *
 * The single owner of address serialization. The key from here is used by the
 * localStorage draft keys and by the keys of the SSR payload and of the data
 * sources alike: once they drift apart, two similar serializations would put the
 * draft under one key and the payload under another. The address path
 * (`/blog/post`) is built by `getPublishedPagePath` in `routePaths.ts` — derived
 * from this very key, so that the segment logic lives in one place.
 */

import type {
    IBricksPageAddress,
    IBricksPageRouteLocation,
    IBricksPageRouteParams,
} from '../../types/pageAddress';
import { BRICKS_ROUTE_NAMES } from '../../constants/routes';
import {
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    PAGENAME_PATTERN,
    URL_PREFIX_MAX_LENGTH,
    URL_PREFIX_PATTERN,
} from '../../constants/publish';

/**
 * Brings `urlPrefix` to its canonical shape: a whitespace-only or empty value
 * means the absence of a prefix.
 *
 * One rule for the whole project: the server DTO normalizes the prefix the same
 * way (''→null), and so did the earlier URL comparisons. Otherwise a string of
 * nothing but spaces, created bypassing the validation, would count as a prefix
 * in one place and as its absence in another — that is, the page would answer at
 * two different addresses.
 *
 * @param value - Raw prefix value.
 * @returns The prefix without surrounding spaces, or null.
 */
export function normalizeUrlPrefix(value: string | null | undefined): string | null {
    return value?.trim() || null;
}

/**
 * Assembles an address out of the pair of values, normalizing both halves.
 *
 * @param pagename - Page slug.
 * @param urlPrefix - Address prefix (may be absent).
 * @returns Normalized address.
 */
export function toPageAddress(
    pagename: string,
    urlPrefix: string | null | undefined
): IBricksPageAddress {
    return {
        pagename: pagename.trim(),
        urlPrefix: normalizeUrlPrefix(urlPrefix),
    };
}

/**
 * Canonical key of an address: `blog/post`, or `post` for a page without a
 * prefix.
 *
 * Without a leading slash deliberately: the key is inserted inside the composite
 * keys of the storage and of the payload, where a leading slash would read as the
 * separator of their own parts. A side effect is welcome — for a page without a
 * prefix the key matches the former one built out of the name alone, so its
 * localStorage drafts survive the move to address identity.
 *
 * There is no ambiguity between the prefix and the name: both the prefix segments
 * and the pagename are constrained by `PAGE_ROUTE_SEGMENT`, that is, they contain
 * no slash.
 *
 * @param address - Page address.
 * @returns Address key.
 */
export function getPageAddressKey(address: IBricksPageAddress): string {
    const urlPrefix = normalizeUrlPrefix(address.urlPrefix);

    return urlPrefix === null ? address.pagename : `${urlPrefix}/${address.pagename}`;
}

/**
 * Whether this is one and the same address. Compared by the canonical key rather
 * than field by field: `null`, `''` and `'  '` in the prefix all mean the same
 * thing, and a comparison of fields would declare such addresses different.
 *
 * @param first - First address.
 * @param second - Second address.
 * @returns true — the addresses match.
 */
export function isSamePageAddress(first: IBricksPageAddress, second: IBricksPageAddress): boolean {
    return getPageAddressKey(first) === getPageAddressKey(second);
}

/**
 * Assembles the requested `urlPrefix` out of the route parameter. On the prefixed
 * routes (`bricks-page-prefixed`, `bricks-builder-pagename-prefixed`,
 * `bricks-preview-prefixed`) the parameter is repeatable — an array of segments;
 * on the bare routes it is absent altogether.
 *
 * @param param - Value of `route.params.urlPrefix`.
 * @returns The prefix shaped as `a/b/c`, or an empty string.
 */
export function resolveRequestedUrlPrefix(param: unknown): string {
    if (Array.isArray(param)) {
        return param.join('/');
    }

    return typeof param === 'string' ? param : '';
}

/**
 * Page address out of the route parameters — the URL source of truth for the
 * editor, the preview and the live render.
 *
 * @param params - Route parameters.
 * @returns Normalized address.
 */
export function resolvePageAddressFromRoute(params: IBricksPageRouteParams): IBricksPageAddress {
    return toPageAddress(
        typeof params.pagename === 'string' ? params.pagename : '',
        resolveRequestedUrlPrefix(params.urlPrefix)
    );
}

/**
 * Whether the address is valid by format — by the very constants the server DTO
 * and the yup schema of the form use.
 *
 * One check for all the surfaces: an invalid address cannot belong to an existing
 * page, so both the public lookup and the session move by form have to reject it
 * identically. Were they to diverge, the lookup would accept an address no record
 * will ever create, and the session move would steer the editor URL onto a route
 * that does not match it (the parameter regex) and open a 404.
 *
 * @param address - Address being checked.
 * @returns Whether the address is valid.
 */
export function isValidPageAddress(address: IBricksPageAddress): boolean {
    if (
        address.pagename.length < PAGENAME_MIN_LENGTH ||
        address.pagename.length > PAGENAME_MAX_LENGTH ||
        !PAGENAME_PATTERN.test(address.pagename)
    ) {
        return false;
    }

    const urlPrefix = normalizeUrlPrefix(address.urlPrefix);

    if (urlPrefix === null) {
        return true;
    }

    return urlPrefix.length <= URL_PREFIX_MAX_LENGTH && URL_PREFIX_PATTERN.test(urlPrefix);
}

/**
 * The reverse transformation: a named location of an address route out of an
 * address.
 *
 * Assembled here, next to the parsing of the parameters: the route name depends
 * on whether a prefix is present, and a call site picking the name on its own
 * would easily forget about the prefixed variant — the navigation would then go
 * to the bare route and open a foreign page of the same name.
 *
 * @param bareRouteName - Route name for an address without a prefix.
 * @param prefixedRouteName - Route name for an address with a prefix.
 * @param address - Page address.
 * @returns Location for `router.push`.
 */
function getPageRouteLocation(
    bareRouteName: string,
    prefixedRouteName: string,
    address: IBricksPageAddress
): IBricksPageRouteLocation {
    const urlPrefix = normalizeUrlPrefix(address.urlPrefix);

    if (urlPrefix === null) {
        return { name: bareRouteName, params: { pagename: address.pagename } };
    }

    return {
        name: prefixedRouteName,
        params: { pagename: address.pagename, urlPrefix: urlPrefix.split('/') },
    };
}

/**
 * Named location of the page editor (`<builderPrefix>/<address>`).
 *
 * @param address - Page address.
 * @returns Location for `router.push`.
 */
export function getBuilderPageRouteLocation(address: IBricksPageAddress): IBricksPageRouteLocation {
    return getPageRouteLocation(
        BRICKS_ROUTE_NAMES.builderPage,
        BRICKS_ROUTE_NAMES.builderPagePrefixed,
        address
    );
}
