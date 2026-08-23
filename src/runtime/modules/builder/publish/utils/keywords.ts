/**
 * The boundary between the tag list in the editor and the `keywords` string of a
 * page.
 *
 * Storage stays a string (`keywords TEXT` in the database, `string` in the API
 * payloads), so the conversion happens only on the way in and out of the form —
 * neither the adapters nor the contract of an external backend know about it.
 */

// Utils
import { TAGS_SEPARATOR } from '../../../ui/inputs/utils/tags';

/**
 * Parses a keywords string into a tag list: split on the comma, trim, drop the
 * empty ones, dedupe keeping the order.
 *
 * @param value - Keywords string (may be null or empty).
 * @returns Tag list without duplicates and empty values.
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
 * Joins a tag list into a keywords string.
 *
 * @param tags - Tag list.
 * @returns The `keywords` string of a page.
 */
export function serializeKeywords(tags: string[]): string {
    return tags.join(TAGS_SEPARATOR);
}
