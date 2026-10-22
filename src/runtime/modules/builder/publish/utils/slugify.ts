// Types
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

// Constants
import { PAGENAME_MAX_LENGTH } from '../../../common/constants/publish';

/** Cyrillic transliteration for auto-generating a slug from a page title */
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
 * Generates a slug (pagename) from a page title: transliterates Cyrillic, lowers
 * the case, replaces the remaining characters with hyphens and cuts the result to
 * the allowed length.
 *
 * @param title - Page title.
 * @returns A slug of the `[a-z0-9-]` shape (may come out empty for a title with
 * nothing to transliterate).
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
 * Generates a free `pagename` for a copy of a page: the "-copy" suffix, and
 * "-copy-1", "-copy-2" and so on on a collision.
 *
 * Freedom is checked by the ADDRESS, not by the name: a copy inherits the
 * `urlPrefix` of the original (`buildCopyFormState`), so a name taken under
 * somebody else's prefix does not stand in the way of the copy, and a free one
 * under its own prefix is the only thing that matters. Checking the name alone
 * would push a copy to `-copy-3` only because `post-copy` is taken under another
 * prefix.
 *
 * @param address - Address of the source page (the prefix of the copy is the same).
 * @param isAddressAvailable - Availability check for a candidate address.
 * @returns A `pagename` unique within its own prefix for the copy.
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
