/**
 * Pure (DOM-free) functions of the URL policy, shared by sanitizeSvg and
 * sanitizeRichText. Isomorphic — the same result on SSR and on the client.
 *
 * Context: js-xss checks the protocol of `href`/`src`/`background` only, and looks
 * for `javascript:` inside the `url()` of the `style` attribute alone (see
 * `node_modules/xss/lib/default.js#safeAttrValue`). The remaining URL-bearing
 * attributes (`fill`, `stroke`, `filter`, `clip-path`, `mask`, `poster`, arbitrary
 * CSS declarations with a `url()` outside `style`) pass unchecked — this module
 * closes the gap.
 */

// #region Constants
/** Local #-reference inside the document (fragment identifier) */
const LOCAL_FRAGMENT = /^#[\w:.-]+$/;

/**
 * A value shaped as `url(#fragment)` — with optional spaces and quotes (`'`/`"`),
 * with nothing left after the closing parenthesis. Anchored to the whole string —
 * used for the strict attributes (`filter`/`clip-path`/`mask`), which are allowed
 * exactly one local reference.
 */
const LOCAL_FRAGMENT_URL_FUNCTION = /^url\(\s*(['"]?)(#[\w:.-]+)\1\s*\)$/i;

/**
 * Every occurrence of `url(...)` in an arbitrary CSS value (paint attributes,
 * `style`). The quotes around the content are optional and have to match
 * (a backreference); multiple occurrences in one string are supported.
 */
const URL_FUNCTION_GLOBAL = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

/**
 * Any start of a `url(` function (including one with a space before the
 * parenthesis) — the detector of unclosed or unparsable occurrences that
 * `URL_FUNCTION_GLOBAL` does not match.
 */
const URL_FUNCTION_OPENER = /url\s*\(/i;

/** Allowed link protocols: http(s)/mailto/tel/#fragment/root-relative (not protocol-relative) */
const SAFE_LINK_PATTERN = /^(https?:\/\/|mailto:|tel:|#|\/(?!\/))/i;

/** Allowed media sources: http(s) and root-relative (not the protocol-relative `//host`) */
const SAFE_MEDIA_SRC_PATTERN = /^(https?:\/\/|\/(?!\/))/i;
// #endregion

// #region Utils
/**
 * Checks the value of the strict SVG attributes (`filter`, `clip-path`, `mask`):
 * only `none` and a single local `url(#fragment)` reference are allowed.
 * A backslash is rejected outright — it is a potential CSS escape, and our own
 * incomplete parser must not try to decode it.
 *
 * @param value - Raw attribute value.
 */
export function isLocalSvgReferenceValue(value: string): boolean {
    const normalized = value.trim();

    if (normalized.includes('\\')) {
        return false;
    }

    return normalized.toLowerCase() === 'none' || LOCAL_FRAGMENT_URL_FUNCTION.test(normalized);
}

/**
 * Checks whether the value (a `fill`/`stroke` paint attribute, `style`) contains
 * an unsafe URL reference: a backslash, at least one `url(...)` whose argument is
 * not a local fragment, or an unclosed/unparsable `url(` (fail-closed: whatever
 * our own parser did not parse is unsafe).
 * Values without a `url(` (colors, `currentColor`, `none`) count as safe.
 *
 * @param value - Raw attribute value.
 */
export function containsUnsafeSvgReference(value: string): boolean {
    if (value.includes('\\')) {
        return true;
    }

    const matches = [...value.matchAll(URL_FUNCTION_GLOBAL)];

    if (matches.some((match) => !LOCAL_FRAGMENT.test(match[2].trim()))) {
        return true;
    }

    // An unclosed url( — on its own or next to valid occurrences
    // (`url(#a) url(https://evil`): cut the recognized ones out and look at the rest
    return URL_FUNCTION_OPENER.test(value.replace(URL_FUNCTION_GLOBAL, ''));
}

/**
 * Checks an href link of rich text: http(s)/mailto/tel/#fragment/root-relative.
 * A backslash is forbidden outright — the browser's URL parser normalizes `\`
 * into `/`, turning the "local" path `/\evil.example/x` into the
 * protocol-relative `//evil.example/x`. The value has to be passed in DECODED
 * (friendlyAttrValue), otherwise the entity variants (`/&#92;…`, `/&#47;…`) get
 * around the check.
 *
 * @param decodedValue - Attribute value after the HTML entities have been decoded.
 */
export function isSafeLinkUrl(decodedValue: string): boolean {
    const normalized = decodedValue.trim();

    return !normalized.includes('\\') && SAFE_LINK_PATTERN.test(normalized);
}

/**
 * Checks a media source (`src`/`poster`): http(s) and root-relative.
 * A backslash is forbidden for the same reason as in {@link isSafeLinkUrl}; the
 * value has to be passed in decoded.
 *
 * @param decodedValue - Attribute value after the HTML entities have been decoded.
 */
export function isSafeMediaSrcUrl(decodedValue: string): boolean {
    const normalized = decodedValue.trim();

    return !normalized.includes('\\') && SAFE_MEDIA_SRC_PATTERN.test(normalized);
}
// #endregion
