/**
 * The single source of knowledge about media categories for the whole stack.
 *
 * These values used to live as three independent copies — in a UI constant of the
 * gallery, in the media store and in the server-side orchestration — and drifted
 * apart silently: the server accepted any string up to 100 characters for a
 * VARCHAR(50) column, while the set of categories in the filters was a hardcode the
 * database knew nothing about. The list of categories itself now lives in
 * `bricks_media_categories`; what stays here is only what has to match between the
 * client and the server without asking the database.
 *
 * There are no preset categories: the whole set is created by the user, any of them
 * can be deleted, and a file without a category is a legitimate state
 * (`category: null`).
 */

import { labelToSlug } from '../utils/slug';

/**
 * Value of the "all categories" filter. Not a category: it does not exist in the
 * database and never reaches `bricks_media.category` — an upload while "all" is
 * active goes out with no category at all (`null`), because there is nothing to
 * assign it to.
 */
export const ALL_MEDIA_CATEGORIES_FILTER = 'all';

/** Maximum slug length — exactly the `VARCHAR(50)` column */
export const MEDIA_CATEGORY_SLUG_MAX_LENGTH = 50;

/** Maximum length of a category caption (that is as much as makes sense to show in a chip) */
export const MEDIA_CATEGORY_LABEL_MAX_LENGTH = 50;

/**
 * Brings a category caption to the slug of the `VARCHAR(50)` column.
 *
 * @param label - Caption entered by the user.
 * @returns The slug, or an empty string when not a single character came out of the caption.
 */
export function mediaCategoryLabelToSlug(label: string): string {
    return labelToSlug(label, MEDIA_CATEGORY_SLUG_MAX_LENGTH);
}
