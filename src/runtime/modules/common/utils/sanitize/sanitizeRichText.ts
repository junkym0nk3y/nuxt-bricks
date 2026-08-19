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
import { FilterXSS, friendlyAttrValue, safeAttrValue } from './xssInterop';
import { isSafeLinkUrl, isSafeMediaSrcUrl } from './urlPolicy';

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
        // Политика — по ДЕКОДИРОВАННОМУ значению (numeric/hex HTML-энтити):
        // encoded `/&#92;…`/`/&#47;…` проходят raw-проверку как локальный путь,
        // а декодируются в protocol-relative `//host`
        if (name === 'href' && !isSafeLinkUrl(friendlyAttrValue(value))) {
            return '';
        }

        // src (img/video/source) и poster (video) — одна и та же media-политика:
        // http(s)/root-relative, protocol-relative `//host` и backslash запрещены
        if ((name === 'src' || name === 'poster') && !isSafeMediaSrcUrl(friendlyAttrValue(value))) {
            return '';
        }

        return safeAttrValue(tag, name, value, cssFilter);
    },
});

/**
 * Открывающий тег `<a>` в уже отфильтрованном выводе. Атрибуты после js-xss
 * нормализованы (значения в двойных кавычках, `>` внутри значений невозможен),
 * поэтому «до первого `>`» здесь — не эвристика.
 */
const OPEN_ANCHOR_TAG = /<a\s[^>]*>/gi;

/** Ссылка, открывающая новую вкладку. */
const BLANK_TARGET_ATTR = /\starget\s*=\s*"_blank"/i;

/** Существующий rel — его значение заменяется целиком. */
const REL_ATTR = /\srel\s*=\s*"[^"]*"/i;

/** Значение rel, обязательное для ссылок в новую вкладку. */
const FORCED_REL_VALUE = 'noopener noreferrer';

/**
 * Навязывает `rel="noopener noreferrer"` ссылкам с `target="_blank"`.
 *
 * Без `noopener` открытая вкладка получает `window.opener` исходной страницы и
 * может увести её на свой адрес (tabnabbing); `noreferrer` не отдаёт адрес
 * источника. Расширение редактора проставляет rel само, но HTML в схему
 * попадает и мимо него — через режим кода редактора и через импорт схемы, —
 * поэтому гарантию даёт рендер, а не редактор.
 *
 * @param html - Разметка после FilterXSS.
 * @returns Разметка, где у каждой ссылки в новую вкладку выставлен rel.
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

        // Self-closing форму js-xss сохраняет (`<a … />`) — дописывать атрибут
        // после слэша нельзя, он уехал бы в имя атрибута
        const closing = tag.endsWith('/>') ? ' />' : '>';
        const withoutClosing = tag.slice(0, tag.length - closing.trimStart().length).trimEnd();

        return `${withoutClosing}${forcedRel}${closing}`;
    });
}

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

    return forceBlankTargetRel(stripSanitizerMarkers(richTextFilter.process(html)));
}
// #endregion
