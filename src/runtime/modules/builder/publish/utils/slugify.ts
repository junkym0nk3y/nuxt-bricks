// Constants
import { PAGENAME_MAX_LENGTH } from '../../../common/constants/publish';

/** Транслитерация кириллицы для авто-генерации slug из названия страницы. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
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
    ц: 'ts',
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
 * Генерирует slug (pagename) из названия страницы: транслитерирует кириллицу,
 * приводит к нижнему регистру, заменяет прочие символы дефисами и обрезает
 * до допустимой длины.
 *
 * @param title - Название страницы.
 * @returns Slug формата `[a-z0-9-]` (может быть пустым при «непереводимом» названии).
 */
export function slugifyPageTitle(title: string): string {
    const transliterated = title
        .toLowerCase()
        .split('')
        .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
        .join('');

    return transliterated
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, PAGENAME_MAX_LENGTH)
        .replace(/-+$/, '');
}

/**
 * Генерирует свободный `pagename` для копии страницы: суффикс «-copy»,
 * при коллизиях — «-copy-1», «-copy-2» и т.д.
 *
 * @param base - Исходный `pagename`.
 * @param isPagenameAvailable - Проверка доступности кандидата.
 * @returns Уникальный `pagename` для копии.
 */
export function generateCopyPagename(
    base: string,
    isPagenameAvailable: (pagename: string) => boolean
): string {
    const safeBase = base?.trim() ? base.trim() : 'page';
    const normalizedBase = safeBase.replace(/-copy(?:-\d+)?$/, '');
    let candidate = `${normalizedBase}-copy`;
    let suffix = 1;

    while (!isPagenameAvailable(candidate)) {
        candidate = `${normalizedBase}-copy-${suffix}`;
        suffix += 1;
    }

    return candidate;
}
