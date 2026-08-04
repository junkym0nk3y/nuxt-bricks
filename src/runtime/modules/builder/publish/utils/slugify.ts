// Types
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

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
 * Свобода проверяется по АДРЕСУ, а не по имени: копия наследует `urlPrefix`
 * оригинала (`buildCopyFormState`), поэтому занятое имя в чужом префиксе копии не
 * мешает, а свободное в своём — единственное, что имеет значение. Проверка по
 * одному имени уводила бы копию в `-copy-3` только потому, что `post-copy` занят
 * под другим префиксом.
 *
 * @param address - Адрес исходной страницы (префикс копии — тот же).
 * @param isAddressAvailable - Проверка доступности адреса-кандидата.
 * @returns Уникальный в своём префиксе `pagename` для копии.
 */
export function generateCopyPagename(
    address: IBricksPageAddress,
    isAddressAvailable: (address: IBricksPageAddress) => boolean
): string {
    const base = address.pagename;
    const safeBase = base?.trim() ? base.trim() : 'page';
    const normalizedBase = safeBase.replace(/-copy(?:-\d+)?$/, '');
    let candidate = `${normalizedBase}-copy`;
    let suffix = 1;

    while (!isAddressAvailable({ pagename: candidate, urlPrefix: address.urlPrefix })) {
        candidate = `${normalizedBase}-copy-${suffix}`;
        suffix += 1;
    }

    return candidate;
}
