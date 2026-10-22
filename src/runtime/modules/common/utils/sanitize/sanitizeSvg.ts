/**
 * Sanitizer of SVG markup: inline SVG (BlockSvg, the preview of SVG segments, the
 * svgContent of media) and the file of an uploaded SVG in the bucket. Isomorphic
 * (js-xss, no DOM): the SSR response and the hydration give the same result.
 *
 * The allow-list is static vector graphics — shapes, paths, gradients,
 * clip/mask/pattern, text, the basic fe* filters, raster images embedded as data
 * URIs. Cut out are: script, foreignObject, SMIL animations, event attributes,
 * `<style>` (an inline SVG lives in the DOM — its CSS would leak onto the whole page)
 * and any external href (only #fragment is allowed, plus a raster data URI on
 * `<image>`).
 *
 * The output has to stay well-formed XML, not just parseable HTML. The same markup is
 * stored as the `.svg` file of an upload, and a browser reads a standalone SVG with
 * the XML parser: there a lowercased `viewbox` or `lineargradient` is an unknown name,
 * and an attribute without a value is a fatal error that blanks the whole image. An
 * HTML parser forgives all of it — it restores the SVG case inside `<svg>` by a table
 * of the specification — which is why the inline surfaces never showed the defect.
 */
import { FilterXSS, friendlyAttrValue, safeAttrValue } from './xssInterop';
import { stripSanitizerMarkers } from './sanitizeRichText';
import { containsUnsafeSvgReference, isLocalSvgReferenceValue } from './urlPolicy';

// #region Constants
/** Allowed CSS properties of the SVG style attribute */
const SVG_CSS_WHITELIST: Record<string, boolean> = {
    fill: true,
    'fill-opacity': true,
    'fill-rule': true,
    stroke: true,
    'stroke-width': true,
    'stroke-opacity': true,
    'stroke-linecap': true,
    'stroke-linejoin': true,
    'stroke-dasharray': true,
    'stroke-dashoffset': true,
    opacity: true,
    color: true,
    display: true,
    'transform-origin': true,
};

/** Presentation attributes allowed on any SVG tag */
const SVG_GLOBAL_ATTRS = [
    'id',
    'class',
    'style',
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-miterlimit',
    'opacity',
    'transform',
    'clip-path',
    'clip-rule',
    'mask',
    'filter',
    'color',
    'vector-effect',
];

/** Tags of static vector graphics and their specific attributes */
const SVG_TAGS: Record<string, string[]> = {
    svg: [
        'xmlns',
        'xmlns:xlink',
        'viewBox',
        'width',
        'height',
        'preserveAspectRatio',
        'x',
        'y',
        'version',
        'baseProfile',
        'aria-hidden',
        'role',
        'focusable',
    ],
    g: [],
    path: ['d', 'pathLength'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
    defs: [],
    symbol: ['viewBox', 'preserveAspectRatio'],
    use: ['href', 'xlink:href', 'x', 'y', 'width', 'height'],
    image: ['x', 'y', 'width', 'height', 'href', 'xlink:href', 'preserveAspectRatio'],
    linearGradient: [
        'x1',
        'y1',
        'x2',
        'y2',
        'gradientUnits',
        'gradientTransform',
        'spreadMethod',
        'href',
        'xlink:href',
    ],
    radialGradient: [
        'cx',
        'cy',
        'r',
        'fx',
        'fy',
        'fr',
        'gradientUnits',
        'gradientTransform',
        'spreadMethod',
        'href',
        'xlink:href',
    ],
    stop: ['offset', 'stop-color', 'stop-opacity'],
    clipPath: ['clipPathUnits'],
    mask: ['x', 'y', 'width', 'height', 'maskUnits', 'maskContentUnits'],
    pattern: [
        'x',
        'y',
        'width',
        'height',
        'patternUnits',
        'patternContentUnits',
        'patternTransform',
        'viewBox',
        'preserveAspectRatio',
        'href',
        'xlink:href',
    ],
    title: [],
    desc: [],
    text: [
        'x',
        'y',
        'dx',
        'dy',
        'rotate',
        'text-anchor',
        'font-size',
        'font-family',
        'font-weight',
        'letter-spacing',
    ],
    tspan: [
        'x',
        'y',
        'dx',
        'dy',
        'rotate',
        'text-anchor',
        'font-size',
        'font-family',
        'font-weight',
        'letter-spacing',
    ],
    filter: ['x', 'y', 'width', 'height', 'filterUnits', 'primitiveUnits'],
    feGaussianBlur: ['in', 'stdDeviation', 'result', 'edgeMode'],
    feOffset: ['in', 'dx', 'dy', 'result'],
    feBlend: ['in', 'in2', 'mode', 'result'],
    feColorMatrix: ['in', 'type', 'values', 'result'],
    feFlood: ['flood-color', 'flood-opacity', 'result'],
    feComposite: ['in', 'in2', 'operator', 'k1', 'k2', 'k3', 'k4', 'result'],
    feMerge: [],
    feMergeNode: ['in'],
    feDropShadow: ['dx', 'dy', 'stdDeviation', 'flood-color', 'flood-opacity', 'result'],
};

/** A safe href value inside an SVG — a reference to a local fragment only */
const SVG_LOCAL_HREF_PATTERN = /^#[\w:.-]+$/;

/**
 * The one source an `<image>` may have: a raster picture embedded as a data URI. A
 * logo exported with its bitmap inlined arrives exactly so. A URL would load a
 * resource from an arbitrary origin (tracking), and an embedded SVG would carry markup
 * this sanitizer never saw.
 */
const RASTER_DATA_URI_PATTERN = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z\d+/=\s]+$/i;

/**
 * Attributes where only a single local `url(#fragment)` reference or `none` is
 * admissible — an external resource here means loading a filter/mask from an
 * arbitrary origin (tracking/exfil), not code execution.
 */
const STRICT_LOCAL_REFERENCE_ATTRS = new Set(['filter', 'clip-path', 'mask']);

/**
 * Paint attributes: ordinary values (`#fff`, `currentColor`, `none`) are kept as
 * they are, a `url(...)` is allowed with a `#`-fragment only.
 */
const PAINT_REFERENCE_ATTRS = new Set(['fill', 'stroke']);
// #endregion

/**
 * The canonical spelling of every allowed tag and attribute name, keyed by its
 * lowercase form. js-xss lowercases the whitelist and every name it parses, so the
 * output carries `lineargradient` and `viewbox`; the names are put back from here.
 */
const SVG_NAME_CASE: ReadonlyMap<string, string> = new Map(
    [...Object.keys(SVG_TAGS), ...Object.values(SVG_TAGS).flat(), ...SVG_GLOBAL_ATTRS].map(
        (name) => [name.toLowerCase(), name]
    )
);

/**
 * One tag of the js-xss output. Matching the output rather than the input is safe: a
 * `<` or `>` in text or in an attribute value is escaped by then, so every bracket
 * left belongs to a tag js-xss has written itself.
 */
const OUTPUT_TAG_PATTERN = /<(\/?)([^\s/>]+)([^>]*)>/g;

/** One attribute of an output tag: a name, with a double-quoted value or bare */
const OUTPUT_ATTR_PATTERN = /\s+([^\s=/>]+)(?:="([^"]*)")?/g;

/**
 * An ampersand that opens no reference XML knows without a DTD — legal in HTML, a fatal
 * error in XML. js-xss escapes only the angle brackets of a text and leaves a raw `R&D`
 * as it is, and the DOCTYPE that declares the entities of an exported file is cut out,
 * so a named reference beyond the five predefined ones stays undeclared. Escaping it
 * keeps the file readable at the price of showing `&nbsp;` as text in an inline SVG.
 */
const UNDECLARED_AMPERSAND_PATTERN = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g;
// #endregion

// #region Filter
/**
 * Assembles the "tag → attributes" whitelist, adding the presentation attributes.
 * js-xss matches the names case-insensitively, so the keys are lowercased here; the
 * canonical case is put back into the output by `toWellFormedTag`.
 */
function buildSvgWhiteList(): Record<string, string[]> {
    const whiteList: Record<string, string[]> = {};

    for (const [tag, attrs] of Object.entries(SVG_TAGS)) {
        whiteList[tag.toLowerCase()] = [...SVG_GLOBAL_ATTRS, ...attrs];
    }

    return whiteList;
}

const svgFilter = new FilterXSS({
    whiteList: buildSvgWhiteList(),
    css: { whiteList: SVG_CSS_WHITELIST },
    // Disallowed tags are cut out, executable and animating ones along with their content
    stripIgnoreTag: true,
    stripIgnoreTagBody: [
        'script',
        'style',
        'foreignObject',
        'foreignobject',
        'animate',
        'animateMotion',
        'animatemotion',
        'animateTransform',
        'animatetransform',
        'set',
        'iframe',
        'object',
        'embed',
    ],
    safeAttrValue(tag, name, value, cssFilter) {
        // The policy is applied to the DECODED value — the very string js-xss will
        // produce after friendlyAttrValue (numeric/hex HTML entities, `&colon;`,
        // control chars). Otherwise the encoded `url&#40;…&#41;` gets around the
        // deny-list in paint/style and decodes into a live external reference.
        const decoded = friendlyAttrValue(value);

        // External references: the href of use/gradient/pattern may point at a local
        // fragment only, and the href of an embedded image at a raster data URI only
        if (name === 'href' || name === 'xlink:href') {
            const reference = decoded.trim();
            const isAllowed =
                tag === 'image'
                    ? RASTER_DATA_URI_PATTERN.test(reference)
                    : SVG_LOCAL_HREF_PATTERN.test(reference);

            if (!isAllowed) {
                return '';
            }
        }

        // filter/clip-path/mask — only `none` or a single local reference
        if (STRICT_LOCAL_REFERENCE_ATTRS.has(name) && !isLocalSvgReferenceValue(decoded)) {
            return '';
        }

        // fill/stroke/style — ordinary paint values (`#fff`, `currentColor`) pass,
        // a url() is admissible with a local fragment only. style is dropped as a
        // whole attribute on any unsafe url() (the SVG CSS whitelist makes only
        // fill/stroke url-capable, so a per-declaration drop is not needed).
        if (
            (PAINT_REFERENCE_ATTRS.has(name) || name === 'style') &&
            containsUnsafeSvgReference(decoded)
        ) {
            return '';
        }

        return safeAttrValue(tag, name, value, cssFilter);
    },
});

/**
 * Rewrites one tag of the js-xss output into well-formed XML: the canonical case of
 * the names and no attribute left without a value (js-xss writes the name alone when
 * the policy refuses the value).
 *
 * Two attributes differing in case alone (`viewBox` and `viewbox`) are distinct in
 * XML, but js-xss lowercases both into one name, and a repeated attribute is a fatal
 * error of the XML parser. The first one is kept — the HTML parser keeps it too, so the
 * file and the inline SVG show the same.
 *
 * @param _tag - The whole match.
 * @param slash - `/` of a closing tag, empty otherwise.
 * @param name - The tag name as js-xss wrote it.
 * @param attrs - Everything between the name and the closing bracket.
 * @returns The rewritten tag.
 */
function toWellFormedTag(_tag: string, slash: string, name: string, attrs: string): string {
    const values = new Map<string, string>();

    for (const [, attrName, value] of attrs.matchAll(OUTPUT_ATTR_PATTERN)) {
        const canonicalName = attrName && (SVG_NAME_CASE.get(attrName) ?? attrName);

        if (canonicalName && value !== undefined && !values.has(canonicalName)) {
            values.set(canonicalName, value);
        }
    }

    const written = [...values].map(([attrName, value]) => `${attrName}="${value}"`);
    const selfClosing = attrs.trimEnd().endsWith('/') ? ' /' : '';
    const attrsPart = written.length > 0 ? ` ${written.join(' ')}` : '';

    return `<${slash}${SVG_NAME_CASE.get(name) ?? name}${attrsPart}${selfClosing}>`;
}

/**
 * Sanitizes SVG markup against the allow-list of static graphics.
 *
 * @param svg - Arbitrary SVG markup (from the media library or the schema).
 * @returns Markup safe for v-html and well-formed as a standalone `.svg` file.
 */
export function sanitizeSvgMarkup(svg: string | null | undefined): string {
    if (!svg) {
        return '';
    }

    // The ampersands are escaped over the whole output: in it an `&` can stand only in a
    // text or in an attribute value, never in a name
    return stripSanitizerMarkers(svgFilter.process(svg))
        .replace(UNDECLARED_AMPERSAND_PATTERN, '&amp;')
        .replace(OUTPUT_TAG_PATTERN, toWellFormedTag);
}
// #endregion
