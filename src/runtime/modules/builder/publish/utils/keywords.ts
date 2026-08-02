/**
 * Граница между списком тегов в редакторе и строкой `keywords` страницы.
 *
 * Хранение остаётся строкой (`keywords TEXT` в БД, `string` в API-пейлоадах),
 * поэтому конверсия делается только на входе и выходе формы — ни адаптеры, ни
 * контракт внешнего backend об этом не знают.
 */

// Utils
import { TAGS_SEPARATOR } from '../../../ui/inputs/utils/tags';

/**
 * Разбирает строку ключевых слов в список тегов: split по запятой, trim,
 * отбрасывание пустых, дедуп с сохранением порядка.
 *
 * @param value - Строка ключевых слов (может быть null/пустой).
 * @returns Список тегов без дублей и пустых значений.
 */
export function parseKeywords(value: string | null | undefined): string[] {
    if (!value) {
        return [];
    }

    const seen = new Set<string>();

    return value.split(',').reduce<string[]>((tags, raw) => {
        const tag = raw.trim();
        if (!tag || seen.has(tag)) {
            return tags;
        }

        seen.add(tag);
        tags.push(tag);
        return tags;
    }, []);
}

/**
 * Склеивает список тегов в строку ключевых слов.
 *
 * @param tags - Список тегов.
 * @returns Строка для `keywords` страницы.
 */
export function serializeKeywords(tags: string[]): string {
    return tags.join(TAGS_SEPARATOR);
}
