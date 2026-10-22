/**
 * Shared constants of page publishing — a single source for the client-side
 * validation (the yup schema of the form) and for the server-side validation of the
 * DTOs (/api/bricks/**).
 */

// There is deliberately no list of reserved pagenames here: whether an address is
// taken is asked of the routing (`utils/bricks/routePaths.ts` —
// `isPageAddressTaken` and `isEditorAddressTaken`), because such a list would have
// to be maintained by hand and would still know nothing about the pages of the
// consumer application.

/** Length bounds of a pagename (kept in sync with the client-side yup schema) */
export const PAGENAME_MIN_LENGTH = 3;
export const PAGENAME_MAX_LENGTH = 80;

/**
 * Bounds of the SEO fields of a page. A single source for three places at once: the
 * yup schema of the form, the server-side validation of the DTOs and the character
 * counters in the editors. The numbers used to stand as constants in every place,
 * and the details panel limited the title to 120 characters while the sidebar
 * limited it to nothing.
 */
export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 500;

/**
 * The `keywords` limit is counted over the JOINED string (what travels into
 * `<meta name="keywords">` and into the `keywords TEXT` column) rather than over the
 * number of tags.
 */
export const KEYWORDS_MAX_LENGTH = 255;

/**
 * Bound of each third-party code field of a page (`headCode`, `bodyEndCode`). A counter
 * snippet takes one to three thousand characters, so the bound leaves room for several of
 * them while keeping the editorial list, which carries the fields of every page, light.
 */
export const PAGE_CODE_MAX_LENGTH = 20000;

/**
 * Sample input of the page code fields — code rather than product text, so it is not
 * translated. Lives here and not in the component: a closing script tag inside
 * `<script setup>` would end the block of the SFC.
 */
export const PAGE_CODE_PLACEHOLDER = '<script>…</script>';

/**
 * Character class of a single URL segment of a published page (a pagename or a
 * segment of a urlPrefix). A single source both for the validation patterns below
 * and for the custom regex of the parameters of the static published routes
 * (module.ts).
 */
export const PAGE_ROUTE_SEGMENT = '[a-z0-9-]+';

/** Allowed format of a pagename */
export const PAGENAME_PATTERN = new RegExp(`^${PAGE_ROUTE_SEGMENT}$`);

/** Allowed format of a urlPrefix: `[a-z0-9-]` segments separated by `/` */
export const URL_PREFIX_PATTERN = new RegExp(`^${PAGE_ROUTE_SEGMENT}(/${PAGE_ROUTE_SEGMENT})*$`);
export const URL_PREFIX_MAX_LENGTH = 100;

/** Allowed format of a subdomain (of a non-empty one — an empty one normalizes into null) */
export const SUBDOMAIN_PATTERN = /^[a-z0-9-]+$/;
export const SUBDOMAIN_MAX_LENGTH = 63;

/**
 * Machine-readable codes of the 409 conflicts of a page write (the `data.code` of
 * the response): pagename — the name is taken (a unique constraint), revision — the
 * page changed after the passed expectedRevision was read (optimistic locking). A
 * single source for the server (storageErrors/handlerHelpers) and for the client
 * (requestErrors).
 */
export const PAGE_CONFLICT_CODES = {
    pagename: 'PAGENAME_CONFLICT',
    revision: 'REVISION_CONFLICT',
} as const;
