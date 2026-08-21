/**
 * The template part of the Postgres adapter: the `bricks_templates` records. Mixed
 * into the adapter with a spread; why the half is split off and why its name is shared
 * with the HTTP implementation — `TStorageTemplateMethods` in `types/adapters.d.ts`.
 */
import { query, queryOne } from './client';
import {
    TEMPLATE_SELECT_FIELDS,
    TEMPLATE_SUMMARY_FIELDS,
    TEMPLATE_UPDATE_FIELDS,
    buildUpdateQuery,
    isRejectedPostgresWrite,
    isUniqueViolation,
} from './queryBuilders';
import {
    BricksStorageWriteRejectedError,
    BricksTemplateNameConflictError,
} from '../utils/storageErrors';
import type { TDeleteTemplateResult, TStorageTemplateMethods } from '../../types/adapters';
import type {
    IBricksTemplateRow,
    ICreateTemplatePayload,
    IUpdateTemplatePayload,
    TBricksTemplateSummary,
} from '../../../common/types/templates';

/**
 * Creates the template methods of the Postgres adapter.
 *
 * @returns The implementation of the storage contract's template half.
 */
export function createPostgresTemplateMethods(): TStorageTemplateMethods {
    return {
        /**
         * Template summaries, newest first — by the creation date (which is also what
         * `idx_bricks_templates_created_at` indexes). `id DESC` as the second key: two
         * records of one transaction get the same `NOW()`, and without it their order
         * between requests is undefined.
         */
        async listTemplates(): Promise<TBricksTemplateSummary[]> {
            return query<TBricksTemplateSummary>(
                `SELECT ${TEMPLATE_SUMMARY_FIELDS} FROM bricks_templates
                 ORDER BY created_at DESC, id DESC`
            );
        },

        /**
         * The full template by id, or null.
         */
        async getTemplate(id: number): Promise<IBricksTemplateRow | null> {
            return queryOne<IBricksTemplateRow>(
                `SELECT ${TEMPLATE_SELECT_FIELDS} FROM bricks_templates WHERE id = $1`,
                [id]
            );
        },

        /**
         * Creates a template and returns it in full. A taken name (on a race of two
         * simultaneous creators included) → BricksTemplateNameConflictError rather than
         * a driver error.
         *
         * The other PROVEN refusals of the insert (the request never left, the
         * statement was canceled by the database's time limit, the schema or a
         * constraint rejected the data) go into the rejected-write marker: creating a
         * template has an external side effect — the copied preview file — and the
         * handler is entitled to remove it only under a guarantee that there is no
         * row. Without the marker such a file would stay an orphan in storage (the same
         * reason as with a media insert).
         */
        async createTemplate(payload: ICreateTemplatePayload): Promise<IBricksTemplateRow> {
            let result: IBricksTemplateRow | null;

            try {
                result = await queryOne<IBricksTemplateRow>(
                    `INSERT INTO bricks_templates (name, description, thumbnail_url, schema, page_meta)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING ${TEMPLATE_SELECT_FIELDS}`,
                    [
                        payload.name,
                        payload.description ?? null,
                        payload.thumbnailUrl ?? null,
                        JSON.stringify(payload.schema),
                        JSON.stringify(payload.pageMeta),
                    ]
                );
            } catch (error: unknown) {
                // The name conflict comes ahead of the shared marker: it guarantees
                // the refusal on its own, but it is the one the client needs (the hint
                // under the field)
                if (isUniqueViolation(error)) {
                    throw new BricksTemplateNameConflictError();
                }

                if (isRejectedPostgresWrite(error)) {
                    throw new BricksStorageWriteRejectedError(
                        'Template row was rejected by the database',
                        error
                    );
                }

                throw error;
            }

            if (!result) {
                throw new Error('Failed to create template');
            }

            return result;
        },

        /**
         * Edits a template's label; null — no such template. A taken name →
         * BricksTemplateNameConflictError.
         *
         * An empty payload never reaches here: "at least one field" is required by the
         * handler's validator — otherwise a PATCH with no fields would assemble an
         * `UPDATE ... SET WHERE id`.
         */
        async updateTemplate(
            id: number,
            payload: IUpdateTemplatePayload
        ): Promise<IBricksTemplateRow | null> {
            const { updates, values } = buildUpdateQuery(payload, TEMPLATE_UPDATE_FIELDS);

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            values.push(id);

            try {
                return await queryOne<IBricksTemplateRow>(
                    `UPDATE bricks_templates
                     SET ${updates.join(', ')}
                     WHERE id = $${values.length}
                     RETURNING ${TEMPLATE_SELECT_FIELDS}`,
                    values
                );
            } catch (error: unknown) {
                if (isUniqueViolation(error)) {
                    throw new BricksTemplateNameConflictError();
                }

                throw error;
            }
        },

        /**
         * Deletes a template and returns the URL of its preview (the handler needs it
         * to sweep the file); null — no such template.
         */
        async deleteTemplate(id: number): Promise<TDeleteTemplateResult> {
            return queryOne<{ thumbnailUrl: string | null }>(
                `DELETE FROM bricks_templates WHERE id = $1
                 RETURNING thumbnail_url as "thumbnailUrl"`,
                [id]
            );
        },
    };
}
