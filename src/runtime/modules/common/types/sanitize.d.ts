/**
 * Types of the sanitizers of `common/utils/sanitize`.
 */

/**
 * How a surface widens the base rich-text profile. Only widening is offered: the
 * base profile is what published content is rendered through, and a surface that
 * could take a tag OUT of it would look safe while quietly changing what a visitor
 * sees on a page it has nothing to do with.
 */
export interface IRichTextSanitizerExtensions {
    /**
     * Extra tags with the attributes allowed on each: `{ table: [], td: ['colspan'] }`.
     * The global attributes (`style`, `class`) are added on top, as for the base set.
     *
     * A tag already in the base set is WIDENED rather than replaced — an empty list
     * takes nothing away.
     *
     * What no extension may ask for, refused by a throw at construction: an
     * executable or document-level tag (`script`, `iframe`, `base`, …), an event
     * handler attribute (`on*`) and a URL attribute no policy inspects (`srcdoc`,
     * `formaction`, …). Each of those is kept out by the allow-list alone, so
     * granting one would not widen the profile but hole it.
     */
    tags?: Record<string, string[]>;
    /**
     * An extra `href` policy on top of the base one (http(s)/mailto/tel/#/root-
     * relative). It receives the DECODED value, as the base check does — the
     * encoded entity variants get around a raw comparison.
     *
     * It widens the accepted PATHS, never the accepted protocols: a value carrying a
     * scheme is refused even when this policy returns true, because which protocols
     * are safe stays the base profile's decision.
     */
    isExtraLinkAllowed?: (decodedHref: string) => boolean;
}

/**
 * A configured sanitizer: arbitrary HTML in, HTML safe for `v-html` out.
 */
export type TRichTextSanitizer = (html: string | null | undefined) => string;
