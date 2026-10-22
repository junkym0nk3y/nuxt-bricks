/**
 * Captions of the media categories.
 *
 * A caption is whatever the user typed: there are no preset categories, and there
 * is nothing to translate user input with. The utility stays for the lookup by
 * slug — the slug is what `bricks_media.category` holds, while the caption is what
 * has to be shown.
 */

// Types
import type { IMediaCategory } from '../../../common/types/media';

/**
 * Looks up the caption of a category by its slug; an unknown slug is returned as is.
 *
 * The slug rather than an em dash: the category could have been deleted in another
 * session, and showing its machine name is more honest than hiding the fact that the
 * two have drifted apart.
 *
 * @param slug - Slug of the category.
 * @param categories - The known categories.
 * @returns The caption to show to the user.
 */
export function resolveMediaCategoryLabelBySlug(
    slug: string,
    categories: IMediaCategory[]
): string {
    const category = categories.find((item) => item.slug === slug);

    return category ? category.label : slug;
}
