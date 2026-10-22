/**
 * Server-first validation of the media handlers' DTOs (/api/bricks/media/**).
 *
 * Every validator rejects unknown keys (400), checks types and bounds and returns a
 * NEW object built only from the known normalized fields. The shared primitives are
 * in payloadPrimitives.ts, the pages' validators in payloadValidation.ts.
 */
import type { ICreateMediaCategoryPayload, TUpdateMediaPayload } from '../../types/adapters';
import { assertKnownKeys, invalid, requireString } from './payloadPrimitives';
import {
    ALL_MEDIA_CATEGORIES_FILTER,
    MEDIA_CATEGORY_LABEL_MAX_LENGTH,
    MEDIA_CATEGORY_SLUG_MAX_LENGTH,
    mediaCategoryLabelToSlug,
} from '../../../common/constants/mediaCategories';

// #region Constants
const FILENAME_MAX_LENGTH = 255;
const ALT_MAX_LENGTH = 512;

const UPDATE_MEDIA_KEYS = new Set(['filename', 'alt', 'category']);
const CREATE_MEDIA_CATEGORY_KEYS = new Set(['label']);
// #endregion

/**
 * Validates the payload of PATCH /api/bricks/media/:id.
 * Every field is optional; requires at least one.
 *
 * @param body - The normalized request body.
 * @returns A clean media update payload.
 */
export function validateUpdateMediaPayload(body: Record<string, unknown>): TUpdateMediaPayload {
    assertKnownKeys(body, UPDATE_MEDIA_KEYS);

    const result: TUpdateMediaPayload = {};

    if (body.filename !== undefined) {
        result.filename = requireString(body.filename, 'filename', {
            min: 1,
            max: FILENAME_MAX_LENGTH,
        });
    }

    if (body.alt !== undefined) {
        result.alt = requireString(body.alt, 'alt', { max: ALT_MAX_LENGTH });
    }

    // null is a deliberate clearing of the category off the file, which is why it
    // differs from the key's absence: undefined means "leave alone", null — "remove"
    if (body.category !== undefined) {
        result.category = body.category === null ? null : validateMediaCategory(body.category);
    }

    if (Object.keys(result).length === 0) {
        invalid('No fields to update');
    }

    return result;
}

/**
 * Validates a media category's slug syntactically (used by the multipart upload
 * handler too). The length ceiling is exactly the `VARCHAR(50)` column: the former 100
 * characters passed validation and failed at the insert.
 *
 * The category's existence is NOT checked here — that is done by
 * `assertKnownMediaCategory` at the handler, which has storage available.
 *
 * @param value - The raw value of the category field.
 * @returns The category after a trim.
 */
export function validateMediaCategory(value: unknown): string {
    return requireString(value, 'category', { min: 1, max: MEDIA_CATEGORY_SLUG_MAX_LENGTH });
}

/**
 * Validates the payload of POST /api/bricks/media/categories and derives the slug out
 * of the label. The slug is computed by the server rather than by the client: it goes
 * into a column and into the filter, and trusting its computation to the input would
 * mean accepting any string.
 *
 * @param body - The normalized request body.
 * @returns The new category's slug and label.
 */
export function validateCreateMediaCategoryPayload(
    body: Record<string, unknown>
): ICreateMediaCategoryPayload {
    assertKnownKeys(body, CREATE_MEDIA_CATEGORY_KEYS);

    const label = requireString(body.label, 'label', {
        min: 1,
        max: MEDIA_CATEGORY_LABEL_MAX_LENGTH,
    });
    const slug = mediaCategoryLabelToSlug(label);

    if (!slug) {
        invalid('Category label must contain at least one letter or digit');
    }

    // The service value of the "all categories" filter cannot be a category: the
    // label "All" yields exactly this slug, and the row of chips would end up with two
    // elements carrying one value — while the category itself would become
    // unfilterable and unreachable for uploads (a new file's category is taken from
    // the active filter, and under "All" a file is stored with no category at all)
    if (slug === ALL_MEDIA_CATEGORIES_FILTER) {
        invalid(`Category slug "${ALL_MEDIA_CATEGORIES_FILTER}" is reserved for the "all" filter`);
    }

    return { slug, label };
}
