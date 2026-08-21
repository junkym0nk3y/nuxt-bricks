/**
 * Sanitizer of inline SVG (BlockSvg, the preview of SVG segments, the svgContent of
 * media). Isomorphic (js-xss, no DOM): the SSR response and the hydration give the
 * same result.
 *
 * The allow-list is static vector graphics — shapes, paths, gradients,
 * clip/mask/pattern, text, the basic fe* filters. Cut out are: script,
 * foreignObject, SMIL animations, event attributes, `<style>` (an inline SVG lives
 * in the DOM — its CSS would leak onto the whole page) and any external href (only
 * #fragment is allowed).
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

// #region Filter
/**
 * Assembles the "tag → attributes" whitelist, adding the presentation attributes.
 * SVG tag names are case-sensitive (clipPath, linearGradient) — js-xss lowercases
 * the tags when matching, so the keys are duplicated in lowercase while the
 * original case is preserved in the output.
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

        // External references (the href of use/gradient/pattern) — a local fragment only
        if (
            (name === 'href' || name === 'xlink:href') &&
            !SVG_LOCAL_HREF_PATTERN.test(decoded.trim())
        ) {
            return '';
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
 * Sanitizes inline SVG markup against the allow-list of static graphics.
 *
 * @param svg - Arbitrary SVG markup (from the media library or the schema).
 * @returns Markup safe for v-html.
 */
export function sanitizeSvgMarkup(svg: string | null | undefined): string {
    if (!svg) {
        return '';
    }

    return stripSanitizerMarkers(svgFilter.process(svg));
}
// #endregion
