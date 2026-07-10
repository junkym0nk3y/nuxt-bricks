/**
 * Санитайзер rich-text HTML (вывод TipTap: BlockText, BlockAccordion,
 * slot-контент канваса). Изоморфный (SSR + клиент): собственный парсер js-xss,
 * DOM не нужен — SSR-ответ и hydration дают одинаковый результат.
 *
 * Allow-list покрывает ровно набор расширений `createTiptapEditor` (StarterKit,
 * TextStyle/Color/FontFamily/FontSize/FontWeight/LineHeight/LetterSpacing,
 * TextAlign, ResizableImage/Video, ссылки). Всё вне списка — вырезается,
 * включая on*-атрибуты, script/iframe и не-http(s) протоколы ссылок.
 */
import { FilterXSS, safeAttrValue } from './xssInterop';

// #region Constants
/** Разрешённые CSS-свойства inline-style (расширения TipTap пишут только их). */
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

/** Атрибуты, разрешённые на любом rich-text теге. */
const GLOBAL_ATTRS = ['style', 'class'];

/** Разрешённые протоколы ссылок (плюс относительные пути и #-якоря). */
const SAFE_LINK_PATTERN = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/** Разрешённые источники медиа (относительные пути и http(s)). */
const SAFE_MEDIA_SRC_PATTERN = /^(https?:\/\/|\/)/i;

/**
 * Теги rich-text: блочные и inline узлы TipTap-набора.
 * img/video — ResizableImage/ResizableVideo (медиа-галерея).
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
 * Собирает whitelist «тег → атрибуты» с глобальными атрибутами.
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
    // Неразрешённые теги вырезаются (текст сохраняется), исполняемые — целиком
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed', 'noscript'],
    safeAttrValue(tag, name, value, cssFilter) {
        if (name === 'href' && !SAFE_LINK_PATTERN.test(value.trim())) {
            return '';
        }

        if (name === 'src' && !SAFE_MEDIA_SRC_PATTERN.test(value.trim())) {
            return '';
        }

        return safeAttrValue(tag, name, value, cssFilter);
    },
});

/**
 * Убирает служебные маркеры js-xss: парные `[removed]…[/removed]` вырезаются
 * самим фильтром, но self-closing тег из stripIgnoreTagBody (без закрывающего)
 * оставляет одиночный маркер в выводе.
 *
 * @param html - Результат FilterXSS.process.
 * @returns Разметка без маркеров.
 */
export function stripSanitizerMarkers(html: string): string {
    return html.replace(/\[\/?removed\]/g, '');
}

/**
 * Санитизирует rich-text HTML по allow-list TipTap-набора.
 *
 * @param html - Произвольный HTML (из схемы страницы).
 * @returns Безопасный HTML для v-html.
 */
export function sanitizeRichTextHtml(html: string | null | undefined): string {
    if (!html) {
        return '';
    }

    return stripSanitizerMarkers(richTextFilter.process(html));
}
// #endregion
