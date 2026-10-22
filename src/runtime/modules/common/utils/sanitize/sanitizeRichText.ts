/**
 * Sanitizer of rich-text HTML (the TipTap output: BlockText, BlockAccordion, the
 * slot content of the canvas). Isomorphic (SSR + client): js-xss has a parser of
 * its own, no DOM is needed — the SSR response and the hydration give the same
 * result.
 *
 * The allow-list covers exactly the set of `createTiptapEditor` extensions
 * (StarterKit, TextStyle/Color/FontFamily/FontSize/FontWeight/LineHeight/
 * LetterSpacing, TextAlign, ResizableImage/Video, links). Everything outside the
 * list is cut out, on* attributes, script/iframe and non-http(s) link protocols
 * included.
 */
import type { IRichTextSanitizerExtensions, TRichTextSanitizer } from '../../types/sanitize';

import { escapeAttrValue, FilterXSS, friendlyAttrValue, safeAttrValue } from './xssInterop';
import { isSafeLinkUrl, isSafeMediaSrcUrl } from './urlPolicy';

// #region Constants
/** Allowed CSS properties of an inline style (the TipTap extensions write these only) */
const RICH_TEXT_CSS_WHITELIST: Record<string, boolean> = {
    color: true,
    'background-color': true,
    'font-size': true,
    'font-family': true,
    'font-weight': true,
    'font-style': true,
    'text-align': true,
    'text-decoration': true,
    'text-decoration-line': true,
    'letter-spacing': true,
    'line-height': true,
    width: true,
    height: true,
    'max-width': true,
};

/** Attributes allowed on any rich-text tag */
const GLOBAL_ATTRS = ['style', 'class'];

/**
 * Rich-text tags: the block and inline nodes of the TipTap set.
 * img/video are ResizableImage/ResizableVideo (the media gallery).
 */
const RICH_TEXT_TAGS: Record<string, string[]> = {
    p: [],
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: [],
    ul: [],
    ol: ['start', 'type'],
    li: [],
    blockquote: [],
    pre: [],
    code: [],
    hr: [],
    br: [],
    strong: [],
    b: [],
    em: [],
    i: [],
    u: [],
    s: [],
    del: [],
    span: [],
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    video: [
        'src',
        'poster',
        'controls',
        'autoplay',
        'loop',
        'muted',
        'playsinline',
        'preload',
        'width',
        'height',
    ],
    source: ['src', 'type'],
};
// #endregion

// #region Filter
/**
 * An event handler attribute (`onclick`, `onerror`, …). js-xss does not treat these
 * specially: they are kept out by the allow-list alone, and `safeAttrValue` would
 * merely escape the value, leaving a live handler behind.
 */
const EVENT_HANDLER_ATTR = /^on/i;

/**
 * Tags an extension may not allow. Whatever the surface, allowing one of these is
 * not "a wider profile" but a hole: `stripIgnoreTagBody` reaches a tag only while it
 * stays OFF the allow-list, so putting `iframe` or `script` on it hands `v-html` a
 * live frame or a live script instead of the text of a cut-out element. The
 * document-level tags are here for the same reason one step removed — `<base>`
 * repoints every relative link on the page, `<meta>` and `<link>` reach outside the
 * fragment being rendered.
 */
const FORBIDDEN_EXTENSION_TAGS = new Set([
    'script',
    'style',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'noscript',
    'base',
    'link',
    'meta',
]);

/**
 * Attributes an extension may not allow. Each carries a URL or markup that
 * `safeAttrValue` never looks at — the policy below covers `href`, `src` and
 * `poster`, and js-xss itself only adds `background` and the `url()` of `style`.
 * `srcdoc` is a whole document, `formaction`/`action` retarget a submit, `ping` and
 * `xlink:href` are fetches of their own.
 */
const FORBIDDEN_EXTENSION_ATTRS = new Set([
    'srcdoc',
    'formaction',
    'action',
    'ping',
    'xlink:href',
    'http-equiv',
]);

/**
 * The scheme at the head of a URL (`javascript:`, `data:`, `vbscript:`).
 *
 * Whitespace and control characters are dropped before the test rather than trimmed:
 * browsers ignore them INSIDE a scheme too, so `java&#9;script:` reaches the parser
 * as `javascript:` while a leading-trim alone would let it past.
 */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Whitespace and control characters (C0), dropped before the scheme is looked for. */
// oxlint-disable-next-line no-control-regex
const SCHEME_NOISE = /[\s\u0000-\u001f]/gu;

/**
 * Whether a value carries a URL scheme of any kind.
 *
 * @param decodedValue - The already decoded attribute value.
 */
function hasUrlScheme(decodedValue: string): boolean {
    return URL_SCHEME.test(decodedValue.replace(SCHEME_NOISE, ''));
}

/**
 * Assembles the "tag → attributes" whitelist, adding the global attributes.
 *
 * An extension WIDENS a tag that is already there rather than replacing it: assigning
 * over the base entry would silently take attributes away — `{ a: [] }` would leave
 * links without an `href`, and the loss shows up as markup that renders but does
 * nothing.
 *
 * @param extraTags - Tags a surface widens the base set with.
 * @returns The whitelist for FilterXSS.
 */
function buildWhiteList(extraTags: Record<string, string[]>): Record<string, string[]> {
    const whiteList: Record<string, string[]> = {};
    const tags = new Set([...Object.keys(RICH_TEXT_TAGS), ...Object.keys(extraTags)]);

    for (const tag of tags) {
        const attrs = [...(RICH_TEXT_TAGS[tag] ?? []), ...(extraTags[tag] ?? [])];

        whiteList[tag] = [...GLOBAL_ATTRS, ...new Set(attrs)];
    }

    return whiteList;
}

/**
 * Refuses an extension that would widen the profile past what the base one
 * guarantees: an executable or document-level tag, an event handler attribute, or a
 * URL attribute no policy inspects.
 *
 * A throw rather than a quiet drop, and at construction rather than per call: the
 * extensions are literals written in this repository, so this is a programming error
 * of ours — and the sanitizer promises markup safe for `v-html` to every profile
 * built through it, not only to the ones we happened to review.
 *
 * @param extraTags - Tags a surface widens the base set with.
 */
function assertExtensionTagsAreSafe(extraTags: Record<string, string[]>): void {
    for (const [tag, attrs] of Object.entries(extraTags)) {
        const normalizedTag = tag.toLowerCase();

        if (FORBIDDEN_EXTENSION_TAGS.has(normalizedTag)) {
            throw new Error(
                `[nuxt-bricks] Rich-text sanitizer extension allows the executable tag "<${tag}>"`
            );
        }

        const handler = attrs.find((attr) => EVENT_HANDLER_ATTR.test(attr));

        if (handler) {
            throw new Error(
                `[nuxt-bricks] Rich-text sanitizer extension allows the event handler attribute "${handler}" on <${tag}>`
            );
        }

        const unchecked = attrs.find((attr) => FORBIDDEN_EXTENSION_ATTRS.has(attr.toLowerCase()));

        if (unchecked) {
            throw new Error(
                `[nuxt-bricks] Rich-text sanitizer extension allows the unchecked URL attribute "${unchecked}" on <${tag}>`
            );
        }
    }
}

/**
 * Builds a filter over the base rich-text profile.
 *
 * @param extensions - What the surface adds to the base set.
 */
function buildFilter(extensions: IRichTextSanitizerExtensions): InstanceType<typeof FilterXSS> {
    const { tags = {}, isExtraLinkAllowed } = extensions;

    assertExtensionTagsAreSafe(tags);

    return new FilterXSS({
        whiteList: buildWhiteList(tags),
        css: { whiteList: RICH_TEXT_CSS_WHITELIST },
        // Disallowed tags are cut out (the text is kept), executable ones entirely
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed', 'noscript'],
        safeAttrValue(tag, name, value, cssFilter) {
            // The policy works on the DECODED value (numeric/hex HTML entities): the
            // encoded `/&#92;…`/`/&#47;…` pass a raw check as a local path but decode
            // into the protocol-relative `//host`
            if (name === 'href') {
                const decoded = friendlyAttrValue(value);

                if (!isSafeLinkUrl(decoded)) {
                    // Which protocols are safe is decided by the base policy and
                    // nowhere else: an extra policy widens the set of PATHS a surface
                    // accepts, and one written a shade too broadly would otherwise
                    // hand `javascript:` straight to the link — escaping a value does
                    // nothing to its scheme
                    if (!isExtraLinkAllowed?.(decoded) || hasUrlScheme(decoded)) {
                        return '';
                    }

                    // A link the extra policy let through is not a URL js-xss knows
                    // how to check, and its own protocol test would drop it — so the
                    // value goes back by hand. Escaping it is not optional: js-xss
                    // wraps whatever it gets into `href="…"` verbatim, and a policy
                    // that let a quote through would close the attribute and open an
                    // attribute of its own right after the filter
                    return escapeAttrValue(decoded);
                }
            }

            // src (img/video/source) and poster (video) share one media policy:
            // http(s)/root-relative, while the protocol-relative `//host` and a
            // backslash are forbidden
            if (
                (name === 'src' || name === 'poster') &&
                !isSafeMediaSrcUrl(friendlyAttrValue(value))
            ) {
                return '';
            }

            return safeAttrValue(tag, name, value, cssFilter);
        },
    });
}

const richTextFilter = buildFilter({});

/**
 * The opening `<a>` tag in the already filtered output. After js-xss the
 * attributes are normalized (values in double quotes, a `>` inside a value is
 * impossible), so "up to the first `>`" is not a heuristic here.
 */
const OPEN_ANCHOR_TAG = /<a\s[^>]*>/gi;

/** A link that opens a new tab */
const BLANK_TARGET_ATTR = /\starget\s*=\s*"_blank"/i;

/** An existing rel — its value is replaced as a whole */
const REL_ATTR = /\srel\s*=\s*"[^"]*"/i;

/** The rel value mandatory for links opening a new tab */
const FORCED_REL_VALUE = 'noopener noreferrer';

/**
 * Forces `rel="noopener noreferrer"` onto the links with `target="_blank"`.
 *
 * Without `noopener` the opened tab receives the `window.opener` of the source
 * page and can steer it to an address of its own (tabnabbing); `noreferrer`
 * withholds the address of the source. The editor extension sets the rel itself,
 * but HTML reaches the schema bypassing it too — through the code mode of the
 * editor and through a schema import — so the guarantee is given by the render,
 * not by the editor.
 *
 * @param html - Markup after FilterXSS.
 * @returns Markup where every link opening a new tab has the rel set.
 */
function forceBlankTargetRel(html: string): string {
    return html.replace(OPEN_ANCHOR_TAG, (tag) => {
        if (!BLANK_TARGET_ATTR.test(tag)) {
            return tag;
        }

        const forcedRel = ` rel="${FORCED_REL_VALUE}"`;

        if (REL_ATTR.test(tag)) {
            return tag.replace(REL_ATTR, forcedRel);
        }

        // js-xss preserves the self-closing form (`<a … />`) — an attribute must
        // not be appended after the slash, it would end up inside the attribute
        // name
        const closing = tag.endsWith('/>') ? ' />' : '>';
        const withoutClosing = tag.slice(0, tag.length - closing.trimStart().length).trimEnd();

        return `${withoutClosing}${forcedRel}${closing}`;
    });
}

/**
 * Strips the service markers of js-xss: the paired `[removed]…[/removed]` is cut
 * out by the filter itself, but a self-closing tag from stripIgnoreTagBody (with
 * no closing one) leaves a lone marker in the output.
 *
 * @param html - Result of FilterXSS.process.
 * @returns Markup without the markers.
 */
export function stripSanitizerMarkers(html: string): string {
    return html.replace(/\[\/?removed\]/g, '');
}

/**
 * Sanitizes rich-text HTML against the allow-list of the TipTap set.
 *
 * @param html - Arbitrary HTML (from the page schema).
 * @returns HTML safe for v-html.
 */
export function sanitizeRichTextHtml(html: string | null | undefined): string {
    if (!html) {
        return '';
    }

    return forceBlankTargetRel(stripSanitizerMarkers(richTextFilter.process(html)));
}

/**
 * Builds a sanitizer over the base rich-text profile for a surface whose markup is
 * legitimately wider — the built-in documentation with its markdown tables, for one.
 *
 * A profile of its own rather than a wider common allow-list: everything added here
 * would otherwise be allowed in the content of published pages too, and "tables are
 * permitted in a text block" is a product decision, not a sanitizer detail.
 *
 * @param extensions - Extra tags and the extra link policy of the surface.
 * @returns A sanitizer with the same guarantees as the base one, plus the extensions.
 */
export function createRichTextHtmlSanitizer(
    extensions: IRichTextSanitizerExtensions
): TRichTextSanitizer {
    const filter = buildFilter(extensions);

    return (html) => (html ? forceBlankTargetRel(stripSanitizerMarkers(filter.process(html))) : '');
}
// #endregion
