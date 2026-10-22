/**
 * Turning a user-entered caption into a machine identifier.
 *
 * Extracted out of the media category constants once the device keys needed the same
 * operation: two independent instances of the transliteration table would drift apart
 * silently, and identifiers built by different rules cannot be compared by eye.
 */

/**
 * The transliteration table. The soft and hard signs are dropped — in an identifier
 * they only add noise in the form of hyphens.
 */
const CYRILLIC_TRANSLITERATION: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'c',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
};

/**
 * Brings a caption to a slug: lowercase Latin letters and digits, everything else a
 * hyphen. Cyrillic is transliterated: a slug travels into filter values, database
 * columns and CSS variable names, where there is no place for percent encoding.
 *
 * Composed characters are normalized (NFKC) before the transliteration — otherwise
 * the Cyrillic short i typed as U+0438 plus a combining breve (U+0306) would give a
 * different slug than the same letter written as a single code point (U+0439).
 *
 * @param label - Caption entered by the user.
 * @param maxLength - Ceiling on the length of the result.
 * @returns The slug, or an empty string when not a single character came out of the caption.
 */
export function labelToSlug(label: string, maxLength: number): string {
    const transliterated = label
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .split('')
        .map((char) => CYRILLIC_TRANSLITERATION[char] ?? char)
        .join('');

    return transliterated
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLength)
        .replace(/-+$/g, '');
}
