/**
 * The template part of the external backend's HTTP adapter: the page template records.
 * Mixed into the adapter with a spread; why the half is split off and why its name is
 * shared with the Postgres implementation — `TStorageTemplateMethods` in
 * `types/adapters.d.ts`.
 *
 * The endpoints' contract mirrors the local `/api/bricks/templates/**`:
 * see docs/external-backend-contract.md.
 */
import type { IBackendHttpClient } from './httpClient';
import {
    isConflictError,
    isNotFoundError,
    normalizeRow,
    normalizeRows,
    unwrapItemsList,
} from './httpAdapterHelpers';
import { BricksTemplateNameConflictError } from '../utils/storageErrors';
import { TEMPLATE_CONFLICT_CODES } from '../../../common/constants/templates';
import type { TDeleteTemplateResult, TStorageTemplateMethods } from '../../types/adapters';
import type {
    IBricksTemplateRow,
    ICreateTemplatePayload,
    IUpdateTemplatePayload,
    TBricksTemplateSummary,
} from '../../../common/types/templates';

/**
 * Creates the template part of the HTTP adapter.
 *
 * @param client - The external backend's HTTP client.
 * @returns The template methods of the storage contract.
 */
export function createHttpTemplateMethods(client: IBackendHttpClient): TStorageTemplateMethods {
    return {
        /**
         * Template summaries (`GET {base}/templates`): a flat array or an `{ items }`
         * envelope — as with the media listings.
         *
         * The order and the block count in a summary are the backend's duty:
         * `blocksCount` cannot be computed from the schema here, as the summary carries
         * no schema at all.
         */
        async listTemplates(): Promise<TBricksTemplateSummary[]> {
            const raw = await client.request('GET', 'templates');

            return normalizeRows<TBricksTemplateSummary>(
                unwrapItemsList(raw, 'GET templates'),
                'GET templates'
            );
        },

        /**
         * The full template by id (`GET {base}/templates/:id`); a 404 → null.
         */
        async getTemplate(id: number): Promise<IBricksTemplateRow | null> {
            try {
                const raw = await client.request('GET', `templates/${id}`);

                return normalizeRow<IBricksTemplateRow>(raw, `GET template ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        /**
         * Creates a template (`POST {base}/templates`). Only the exact contract code is
         * mapped onto a domain error: a 409 `TEMPLATE_NAME_CONFLICT` →
         * BricksTemplateNameConflictError. A 409 with no code or with an unfamiliar one
         * is a generic error: an unrelated conflict of the backend's (a quota, a state)
         * must not make the form turn its name field red.
         */
        async createTemplate(payload: ICreateTemplatePayload): Promise<IBricksTemplateRow> {
            try {
                const raw = await client.request('POST', 'templates', payload);

                return normalizeRow<IBricksTemplateRow>(raw, 'POST template');
            } catch (error: unknown) {
                if (isConflictError(error) && error.errorCode === TEMPLATE_CONFLICT_CODES.name) {
                    throw new BricksTemplateNameConflictError();
                }

                throw error;
            }
        },

        /**
         * Edits a template's label (`PATCH {base}/templates/:id`); a 404 → null, a 409
         * `TEMPLATE_NAME_CONFLICT` → BricksTemplateNameConflictError.
         */
        async updateTemplate(
            id: number,
            payload: IUpdateTemplatePayload
        ): Promise<IBricksTemplateRow | null> {
            try {
                const raw = await client.request('PATCH', `templates/${id}`, payload);

                return normalizeRow<IBricksTemplateRow>(raw, `PATCH template ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                if (isConflictError(error) && error.errorCode === TEMPLATE_CONFLICT_CODES.name) {
                    throw new BricksTemplateNameConflictError();
                }

                throw error;
            }
        },

        /**
         * Deletes a template (`DELETE {base}/templates/:id`); a 404 → null.
         *
         * The preview files stay local in external mode too, so the sweep is done by
         * the local handler — it needs the deleted record's `thumbnail_url`. A backend
         * that answered with an empty body (204) reports the fact of the deletion
         * alone: from the contract's point of view there is then nothing to sweep, and
         * its own file (if it stores previews itself) remains its own concern.
         */
        async deleteTemplate(id: number): Promise<TDeleteTemplateResult> {
            try {
                const raw = await client.request('DELETE', `templates/${id}`);

                if (raw === null) {
                    return { thumbnailUrl: null };
                }

                const row = normalizeRow<{ thumbnailUrl?: string | null }>(
                    raw,
                    `DELETE template ${id}`
                );

                return { thumbnailUrl: row.thumbnailUrl ?? null };
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },
    };
}
