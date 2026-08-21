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
import { FilterXSS, friendlyAttrValue, safeAttrValue } from './xssInterop';
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
 * Assembles the "tag → attributes" whitelist, adding the global attributes.
 */
function buildWhiteList(): Record<string, string[]> {
    const whiteList: Record<string, string[]> = {};

    for (const [tag, attrs] of Object.entries(RICH_TEXT_TAGS)) {
        whiteList[tag] = [...GLOBAL_ATTRS, ...attrs];
    }

    return whiteList;
}

const richTextFilter = new FilterXSS({
    whiteList: buildWhiteList(),
    css: { whiteList: RICH_TEXT_CSS_WHITELIST },
    // Disallowed tags are cut out (the text is kept), executable ones entirely
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed', 'noscript'],
    safeAttrValue(tag, name, value, cssFilter) {
        // The policy works on the DECODED value (numeric/hex HTML entities): the
        // encoded `/&#92;…`/`/&#47;…` pass a raw check as a local path but decode
        // into the protocol-relative `//host`
        if (name === 'href' && !isSafeLinkUrl(friendlyAttrValue(value))) {
            return '';
        }

        // src (img/video/source) and poster (video) share one media policy:
        // http(s)/root-relative, while the protocol-relative `//host` and a
        // backslash are forbidden
        if ((name === 'src' || name === 'poster') && !isSafeMediaSrcUrl(friendlyAttrValue(value))) {
            return '';
        }

        return safeAttrValue(tag, name, value, cssFilter);
    },
});

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
// #endregion
