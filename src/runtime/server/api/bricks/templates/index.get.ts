import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/templates — template summaries for the Templates section and
 * for choosing the source of a new page (no `schema` and no `pageMeta`, with the
 * block count).
 *
 * A `{ templates }` envelope rather than a bare array: the section reads the list
 * with the same composable as the accounts, and one response shape spares them
 * two different parsers. The full template is served by the point lookup
 * `GET /templates/:id`.
 */
export default defineEventHandler(async () => {
    try {
        return { templates: await useBricksStorageAdapter().listTemplates() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch templates');
    }
});
