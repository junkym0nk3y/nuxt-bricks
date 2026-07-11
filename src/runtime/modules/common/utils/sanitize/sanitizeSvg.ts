/**
 * Санитайзер inline SVG (BlockSvg, превью SVG-сегментов, svgContent медиа).
 * Изоморфный (js-xss, без DOM): SSR-ответ и hydration дают одинаковый результат.
 *
 * Allow-list: статичная векторная графика — фигуры, пути, градиенты,
 * clip/mask/pattern, текст, базовые fe*-фильтры. Вырезаются: script,
 * foreignObject, SMIL-анимации, event-атрибуты, `<style>` (инлайн-SVG в DOM —
 * его CSS протёк бы на всю страницу) и любые внешние href (только #fragment).
 */
import { FilterXSS, safeAttrValue } from './xssInterop';
import { stripSanitizerMarkers } from './sanitizeRichText';
import { containsUnsafeSvgReference, isLocalSvgReferenceValue } from './urlPolicy';

// #region Constants
/** Разрешённые CSS-свойства style-атрибута SVG. */
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

/** Презентационные атрибуты, разрешённые на любом SVG-теге. */
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

/** Теги статичной векторной графики и их специфичные атрибуты. */
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

/** Безопасное значение href внутри SVG — только ссылка на локальный fragment. */
const SVG_LOCAL_HREF_PATTERN = /^#[\w:.-]+$/;

/**
 * Атрибуты, где допустима только одна локальная ссылка `url(#fragment)`
 * либо `none` — внешний ресурс здесь означает загрузку filter/mask с
 * произвольного origin (tracking/exfil), не исполнение кода.
 */
const STRICT_LOCAL_REFERENCE_ATTRS = new Set(['filter', 'clip-path', 'mask']);

/**
 * Paint-атрибуты: обычные значения (`#fff`, `currentColor`, `none`)
 * сохраняются как есть, `url(...)` разрешён только с `#`-fragment.
 */
const PAINT_REFERENCE_ATTRS = new Set(['fill', 'stroke']);
// #endregion

// #region Filter
/**
 * Собирает whitelist «тег → атрибуты» с презентационными атрибутами.
 * Имена тегов SVG регистрозависимы (clipPath, linearGradient) — js-xss
 * приводит теги к lowercase при матчинге, поэтому ключи дублируются в lowercase,
 * а исходный регистр сохраняется в выводе.
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
    // Неразрешённые теги вырезаются, исполняемые/анимируемые — вместе с содержимым
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
        // Внешние ссылки (use/gradient/pattern href) — только локальный fragment
        if (
            (name === 'href' || name === 'xlink:href') &&
            !SVG_LOCAL_HREF_PATTERN.test(value.trim())
        ) {
            return '';
        }

        // filter/clip-path/mask — только `none` либо одна локальная ссылка
        if (STRICT_LOCAL_REFERENCE_ATTRS.has(name) && !isLocalSvgReferenceValue(value)) {
            return '';
        }

        // fill/stroke/style — обычные paint-значения проходят, url() допустим
        // только с локальным fragment (js-xss сам блокирует лишь javascript:
        // внутри style, внешний/data: url в url() не проверяет никто из них)
        if (
            (PAINT_REFERENCE_ATTRS.has(name) || name === 'style') &&
            containsUnsafeSvgReference(value)
        ) {
            return '';
        }

        return safeAttrValue(tag, name, value, cssFilter);
    },
});

/**
 * Санитизирует inline SVG-разметку по allow-list статичной графики.
 *
 * @param svg - Произвольная SVG-разметка (из медиа-библиотеки/схемы).
 * @returns Безопасная разметка для v-html.
 */
export function sanitizeSvgMarkup(svg: string | null | undefined): string {
    if (!svg) {
        return '';
    }

    return stripSanitizerMarkers(svgFilter.process(svg));
}
// #endregion
