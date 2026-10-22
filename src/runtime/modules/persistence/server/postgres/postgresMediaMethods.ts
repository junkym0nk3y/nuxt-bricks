/**
 * The media part of the Postgres adapter: the `bricks_media` records and the
 * `bricks_media_categories` categories. Mixed into the adapter with a spread; why the
 * half is split off and why its name is shared with the HTTP implementation —
 * `TStorageMediaMethods` in `types/adapters.d.ts`.
 */
import { query, queryOne, withTransaction } from './client';
import {
    MEDIA_SELECT_FIELDS,
    MEDIA_CATEGORY_SELECT_FIELDS,
    MEDIA_UPDATE_FIELDS,
    buildUpdateQuery,
    isForeignKeyViolation,
    isRejectedPostgresWrite,
    isUniqueViolation,
    readViolatedConstraint,
} from './queryBuilders';
import {
    BricksStorageWriteRejectedError,
    BricksUnknownMediaCategoryError,
} from '../utils/storageErrors';
import type {
    ICreateMediaPayload,
    ICreateMediaCategoryPayload,
    TDeleteMediaCategoryResult,
    TStorageMediaMethods,
    TUpdateMediaPayload,
} from '../../types/adapters';
import type { IMediaCategory, IMediaItem } from '../../../common/types/media';

/**
 * Returns a media record by the file's URL, or null.
 *
 * @param url - The file's public URL.
 * @returns The media record, or null.
 */
function findMediaByUrl(url: string): Promise<IMediaItem | null> {
    return queryOne<IMediaItem>(`SELECT ${MEDIA_SELECT_FIELDS} FROM bricks_media WHERE url = $1`, [
        url,
    ]);
}

/**
 * The name of the `bricks_media(url)` unique index — set explicitly in the base
 * migration.
 */
const MEDIA_URL_UNIQUE_CONSTRAINT = 'uq_bricks_media_url';

/**
 * Translates a refusal by the `bricks_media.category` foreign key into a domain
 * error.
 *
 * The category could have been deleted between the handler's early check and the
 * write itself — then the refusal comes from the database, and without the
 * translation the SQLSTATE would reach the client as a generic 500 instead of a
 * clear "there is no such category".
 *
 * The translation is applied only when the payload carries a non-null category.
 * That gives no full protection against a future second foreign key (its violation
 * can arrive in a write where the category is set too) — `bricks_media` has one
 * foreign key at present, and a second one appearing will require telling them
 * apart by `constraint`.
 *
 * @param error - The caught query error.
 * @param category - The category from the write's payload (null — the category is
 * not being written).
 * @returns The domain error, or the original one.
 */
function toDomainMediaWriteError(error: unknown, category: string | null | undefined): unknown {
    if (!category || !isForeignKeyViolation(error)) {
        return error;
    }

    return new BricksUnknownMediaCategoryError(category, error);
}

/**
 * Classifies a refusal of a media record's INSERT: marks the refusals in which the
 * row is known not to have appeared.
 *
 * The marker permits the owner of the side effects to delete the file already
 * uploaded, so it is set by proven signs only: the request was never sent; the
 * server canceled the statement itself by its own time limit; the schema does not
 * match the code. The original error goes into `cause` — the HTTP layer keeps its
 * status by it (it looks for a stop by the time limit through `cause` as well), and
 * the server log keeps the details.
 *
 * @param error - The insert's error.
 * @param category - The category from the write's payload.
 * @returns The error with the marker, the category's domain error, or the original
 * one.
 */
function toMediaInsertError(error: unknown, category: string | null | undefined): unknown {
    const domainError = toDomainMediaWriteError(error, category);

    if (domainError !== error) {
        return domainError;
    }

    if (!isRejectedPostgresWrite(error)) {
        return error;
    }

    return new BricksStorageWriteRejectedError('Media row was rejected by the database', error);
}

/**
 * Checks whether a uniqueness conflict COULD have been a conflict over `url`.
 *
 * Telling the constraints apart is mandatory: a primary key conflict (a lagging
 * sequence after a dump restore) creates no row carrying our url, and routing it
 * into a reread would mean returning "found nothing" instead of a guaranteed refusal
 * and leaving the uploaded file an orphan. The index's name is taken from the base
 * migration, where it is set explicitly.
 *
 * An error WITHOUT a constraint name goes into the reread as well rather than into
 * the marker: the absence of the field does not prove the conflict is not over the
 * url (it can be raised by hand, and a compatible server or a proxy can lose it),
 * and an error in that direction costs a deleted file under a live record. A reread,
 * meanwhile, costs one extra SELECT at worst.
 *
 * @param error - The caught query error.
 * @returns true when the conflict could have happened over the url unique index.
 */
function isPossibleMediaUrlConflict(error: unknown): boolean {
    if (!isUniqueViolation(error)) {
        return false;
    }

    const constraint = readViolatedConstraint(error);

    return constraint === null || constraint === MEDIA_URL_UNIQUE_CONSTRAINT;
}

/**
 * Creates the media part of the Postgres adapter.
 *
 * @returns The media methods of the storage contract.
 */
export function createPostgresMediaMethods(): TStorageMediaMethods {
    return {
        /**
         * Returns every media record, newest first.
         */
        async listMedia(): Promise<IMediaItem[]> {
            return query<IMediaItem>(
                `SELECT ${MEDIA_SELECT_FIELDS} FROM bricks_media ORDER BY uploaded_at DESC`
            );
        },

        /**
         * Returns a media record by id, or null.
         */
        async getMedia(id: number): Promise<IMediaItem | null> {
            return queryOne<IMediaItem>(
                `SELECT ${MEDIA_SELECT_FIELDS} FROM bricks_media WHERE id = $1`,
                [id]
            );
        },

        /**
         * Returns a media record by the file's URL, or null (import deduplication).
         */
        async getMediaByUrl(url: string): Promise<IMediaItem | null> {
            return findMediaByUrl(url);
        },

        /**
         * Creates a media record and returns it with its id.
         * Idempotent by url (the IStorageAdapter.createMedia contract): on a
         * conflict of the `uq_bricks_media_url` index (an import race, a retry, a
         * repeat after an unknown outcome) it returns the already existing record.
         *
         * The insert and resolving the conflict are DIFFERENT phases, and only the
         * first one sets the rejected-write marker. In the second one a row for
         * this url already exists, so a failed reread (a stop by the server-side
         * time limit included) does not prove its absence: the marker here would
         * permit deleting the file from under a live record.
         */
        async createMedia(payload: ICreateMediaPayload): Promise<IMediaItem> {
            let result: IMediaItem | null;

            try {
                result = await queryOne<IMediaItem>(
                    `INSERT INTO bricks_media
                (url, filename, alt, size, mime_type, category, svg_content,
                 width, height, preview_url, mock_url, uploaded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
                RETURNING ${MEDIA_SELECT_FIELDS}`,
                    [
                        payload.url,
                        payload.filename,
                        payload.alt ?? '',
                        payload.size,
                        payload.mimeType,
                        payload.category,
                        payload.svgContent ?? null,
                        payload.width ?? null,
                        payload.height ?? null,
                        payload.previewUrl ?? null,
                        payload.mockUrl ?? null,
                        payload.uploadedAt ? new Date(payload.uploadedAt) : null,
                    ]
                );
            } catch (error: unknown) {
                if (!isPossibleMediaUrlConflict(error)) {
                    throw toMediaInsertError(error, payload.category);
                }

                const existing = await findMediaByUrl(payload.url);

                if (!existing) {
                    // There was a conflict but there is no row: it was deleted
                    // between the insert and the reread. The outcome is deliberately
                    // left undetermined — a record for this url did exist, and the
                    // file must not be compensated
                    throw new Error('Failed to resolve conflicting media item', { cause: error });
                }

                return existing;
            }

            if (!result) {
                throw new Error('Failed to create media item');
            }

            return result;
        },

        /**
         * Updates media metadata; null — the record was not found.
         */
        async updateMedia(id: number, payload: TUpdateMediaPayload): Promise<IMediaItem | null> {
            const { updates, values } = buildUpdateQuery(payload, MEDIA_UPDATE_FIELDS);

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            values.push(id);

            try {
                return await queryOne<IMediaItem>(
                    `UPDATE bricks_media
            SET ${updates.join(', ')}
            WHERE id = $${values.length}
            RETURNING ${MEDIA_SELECT_FIELDS}`,
                    values
                );
            } catch (error: unknown) {
                throw toDomainMediaWriteError(error, payload.category);
            }
        },

        /**
         * Deletes a media record; false — the record was not found.
         */
        async deleteMedia(id: number): Promise<boolean> {
            const rows = await query<{ id: number }>(
                'DELETE FROM bricks_media WHERE id = $1 RETURNING id',
                [id]
            );

            return rows.length > 0;
        },

        /**
         * Returns the media library's categories in display order.
         */
        async listMediaCategories(): Promise<IMediaCategory[]> {
            return query<IMediaCategory>(
                `SELECT ${MEDIA_CATEGORY_SELECT_FIELDS}
            FROM bricks_media_categories
            ORDER BY sort_order, id`
            );
        },

        /**
         * Creates a user category; on a repeat of the same slug it returns the
         * existing one (the idempotency contract).
         *
         * `sort_order` is computed as "after everyone" with a step of 10: without
         * that a new category would settle at 0 and go off to the start of the row,
         * ahead of the ones created earlier.
         */
        async createMediaCategory(payload: ICreateMediaCategoryPayload): Promise<IMediaCategory> {
            const created = await queryOne<IMediaCategory>(
                `INSERT INTO bricks_media_categories (slug, label, sort_order)
            VALUES (
                $1,
                $2,
                (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM bricks_media_categories)
            )
            ON CONFLICT (slug) DO NOTHING
            RETURNING ${MEDIA_CATEGORY_SELECT_FIELDS}`,
                [payload.slug, payload.label]
            );

            if (created) {
                return created;
            }

            // DO NOTHING returned no row — a category with this slug already exists
            const existing = await queryOne<IMediaCategory>(
                `SELECT ${MEDIA_CATEGORY_SELECT_FIELDS}
            FROM bricks_media_categories
            WHERE slug = $1`,
                [payload.slug]
            );

            if (!existing) {
                throw new Error('Failed to create media category');
            }

            return existing;
        },

        /**
         * Clears the category off its files and deletes the category itself in a
         * single transaction; null — there is no category with that slug.
         *
         * The category is cleared off the files by an explicit UPDATE, even though
         * `ON DELETE SET NULL` would do the same: the response must say how
         * many files it touched, and no such number can be had out of a DELETE.
         */
        async deleteMediaCategory(slug: string): Promise<TDeleteMediaCategoryResult> {
            return withTransaction(async (txQuery) => {
                const existing = await txQuery<{ slug: string }>(
                    'SELECT slug FROM bricks_media_categories WHERE slug = $1 FOR UPDATE',
                    [slug]
                );

                if (existing.length === 0) {
                    return null;
                }

                const cleared = await txQuery<{ id: number }>(
                    'UPDATE bricks_media SET category = NULL WHERE category = $1 RETURNING id',
                    [slug]
                );

                await txQuery('DELETE FROM bricks_media_categories WHERE slug = $1', [slug]);

                return { clearedCount: cleared.length };
            });
        },
    };
}
