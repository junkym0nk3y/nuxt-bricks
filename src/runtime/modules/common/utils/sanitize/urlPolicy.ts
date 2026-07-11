/**
 * Чистые (без DOM) функции URL-политики, общие для sanitizeSvg и
 * sanitizeRichText. Изоморфны — одинаковый результат на SSR и клиенте.
 *
 * Контекст: js-xss проверяет протокол только у `href`/`src`/`background` и
 * ищет `javascript:` внутри `url()` одного лишь `style`-атрибута (см.
 * `node_modules/xss/lib/default.js#safeAttrValue`). Остальные URL-bearing
 * атрибуты (`fill`, `stroke`, `filter`, `clip-path`, `mask`, `poster`,
 * произвольные CSS-декларации вне `style` c `url()`) проходят без проверки —
 * этот модуль закрывает разрыв.
 */

// #region Constants
/** Локальная #-ссылка внутри документа (fragment identifier). */
const LOCAL_FRAGMENT = /^#[\w:.-]+$/;

/**
 * Значение вида `url(#fragment)` — с необязательными пробелами и кавычками
 * (`'`/`"`), без остатка после закрывающей скобки. Якорится на всю строку —
 * используется для строгих атрибутов (`filter`/`clip-path`/`mask`), которым
 * разрешена ровно одна локальная ссылка.
 */
const LOCAL_FRAGMENT_URL_FUNCTION = /^url\(\s*(['"]?)(#[\w:.-]+)\1\s*\)$/i;

/**
 * Все вхождения `url(...)` в произвольном CSS-значении (paint-атрибуты,
 * `style`). Кавычки вокруг содержимого — опциональны и должны совпадать
 * (backreference), поддерживаются множественные вхождения в одной строке.
 */
const URL_FUNCTION_GLOBAL = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

/**
 * Любое начало `url(`-функции (в т.ч. с пробелом перед скобкой) — детектор
 * незакрытых/непарсибельных вхождений, которые `URL_FUNCTION_GLOBAL` не матчит.
 */
const URL_FUNCTION_OPENER = /url\s*\(/i;

/** Разрешённые протоколы ссылок: http(s)/mailto/tel/#fragment/root-relative (не protocol-relative). */
const SAFE_LINK_PATTERN = /^(https?:\/\/|mailto:|tel:|#|\/(?!\/))/i;

/** Разрешённые источники медиа: http(s) и root-relative (не protocol-relative `//host`). */
const SAFE_MEDIA_SRC_PATTERN = /^(https?:\/\/|\/(?!\/))/i;
// #endregion

// #region Utils
/**
 * Проверяет значение строгих SVG-атрибутов (`filter`, `clip-path`, `mask`):
 * разрешены только `none` и одна локальная ссылка `url(#fragment)`.
 * Обратный слэш отклоняется целиком — потенциальный CSS-escape, который
 * собственный неполный парсер не должен пытаться декодировать.
 *
 * @param value - Сырое значение атрибута.
 */
export function isLocalSvgReferenceValue(value: string): boolean {
    const normalized = value.trim();

    if (normalized.includes('\\')) {
        return false;
    }

    return normalized.toLowerCase() === 'none' || LOCAL_FRAGMENT_URL_FUNCTION.test(normalized);
}

/**
 * Проверяет, содержит ли значение (paint-атрибут `fill`/`stroke`, `style`)
 * небезопасную URL-ссылку: обратный слэш, хотя бы один `url(...)`, чей
 * аргумент — не локальный fragment, либо незакрытый/непарсибельный `url(`
 * (fail-closed: что собственный парсер не разобрал — то небезопасно).
 * Значения без `url(` (цвета, `currentColor`, `none`) считаются безопасными.
 *
 * @param value - Сырое значение атрибута.
 */
export function containsUnsafeSvgReference(value: string): boolean {
    if (value.includes('\\')) {
        return true;
    }

    const matches = [...value.matchAll(URL_FUNCTION_GLOBAL)];

    if (matches.some((match) => !LOCAL_FRAGMENT.test(match[2].trim()))) {
        return true;
    }

    // Незакрытый url( — сам по себе или рядом с валидными вхождениями
    // (`url(#a) url(https://evil`): вырезаем распознанные и смотрим остаток
    return URL_FUNCTION_OPENER.test(value.replace(URL_FUNCTION_GLOBAL, ''));
}

/**
 * Проверяет href-ссылку rich text: http(s)/mailto/tel/#fragment/root-relative.
 * Backslash запрещён целиком — URL-парсер браузера нормализует `\` в `/`,
 * превращая «локальный» путь `/\evil.example/x` в protocol-relative
 * `//evil.example/x`. Значение передавать ДЕКОДИРОВАННЫМ (friendlyAttrValue),
 * иначе entity-варианты (`/&#92;…`, `/&#47;…`) обходят проверку.
 *
 * @param decodedValue - Значение атрибута после декодирования HTML-энтити.
 */
export function isSafeLinkUrl(decodedValue: string): boolean {
    const normalized = decodedValue.trim();

    return !normalized.includes('\\') && SAFE_LINK_PATTERN.test(normalized);
}

/**
 * Проверяет источник медиа (`src`/`poster`): http(s) и root-relative.
 * Backslash запрещён по той же причине, что в {@link isSafeLinkUrl};
 * значение передавать декодированным.
 *
 * @param decodedValue - Значение атрибута после декодирования HTML-энтити.
 */
export function isSafeMediaSrcUrl(decodedValue: string): boolean {
    const normalized = decodedValue.trim();

    return !normalized.includes('\\') && SAFE_MEDIA_SRC_PATTERN.test(normalized);
}
// #endregion
