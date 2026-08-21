/**
 * The product rules for the media categories: what exists and what checks it.
 *
 * Lives apart from `mediaPayloadValidation.ts` because these checks reach out to
 * storage, while that file is pure DTO validation with no dependencies. The dependency
 * is passed as a narrow Pick contract, so that the rules are unit-tested without a real
 * Postgres.
 */
import type { TMediaCategoryStorage } from '../../types/adapters';
import { BricksUnknownMediaCategoryError } from './storageErrors';

/**
 * Checks that the category exists in the media library.
 *
 * The check is server-side and mandatory: the server used to accept any string, and a
 * typo in a category created a "ghost" filter no file but that one fell under. It does
 * not close the race — the category can be deleted between the check and the write, and
 * then the refusal comes from the database's FK — but it saves the most expensive part
 * of an upload (optimizing the image and uploading it into the bucket) over input that
 * is known to be unusable.
 *
 * The error is a domain one rather than a ready HTTP one: a storage rule has no
 * business knowing about statuses, while the early refusal and the FK's refusal must
 * look the same to the client — one point maps them both (`toMediaHttpError`).
 *
 * @param storage - Storage with access to the category list.
 * @param slug - The slug being checked.
 */
export async function assertKnownMediaCategory(
    storage: TMediaCategoryStorage,
    slug: string
): Promise<void> {
    const categories = await storage.listMediaCategories();

    if (categories.some((category) => category.slug === slug)) {
        return;
    }

    throw new BricksUnknownMediaCategoryError(slug);
}
