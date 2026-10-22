/**
 * Types of the address identity of a page.
 *
 * A page is identified by the `urlPrefix + pagename` pair rather than by the name
 * alone: a name is unique only within its own prefix, so `/blog/post` and
 * `/news/post` are different pages. The uniqueness of the pair is held by the
 * database (`uq_bricks_pages_address`), and every place that used to address a page
 * by a `pagename` alone (the URLs of the editor and of the preview, the keys of the
 * drafts and of the SSR payload, the public lookup) works with this pair.
 */

export interface IBricksPageAddress {
    /**
     * Prefix of the address (`blog`, `blog/2026`), or `null` for a page without a
     * prefix. An empty and a whitespace-only string are equivalent to `null` — the
     * same way the forms and the server DTO normalize them.
     */
    urlPrefix: string | null;
    /** Slug of the page — the last segment of the address */
    pagename: string;
}

/**
 * Route parameters an address is assembled from: on the prefixed routes `urlPrefix`
 * is a repeatable parameter (an array of segments), on the bare ones it is absent
 * altogether.
 */
export interface IBricksPageRouteParams {
    pagename?: unknown;
    urlPrefix?: unknown;
}

/**
 * Named location of an address route for `router.push`. The name is chosen by
 * whether a prefix is present, because a prefixed and a bare address are served by
 * different route records, and vue-router would silently trim `params` missing the
 * needed key down to `<prefix>` with nothing after it.
 */
export interface IBricksPageRouteLocation {
    name: string;
    params: {
        pagename: string;
        /** Segments of the prefix; on a bare route the key is absent altogether */
        urlPrefix?: string[];
    };
}
