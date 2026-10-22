import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/templates/:id — the full template with its schema and styling.
 *
 * Needed by exactly one scenario — creating a page from a template: the list
 * summary carries no schema, and serving it to every card at once would mean
 * hauling megabytes for the sake of a grid of thumbnails.
 */
export default defineEventHandler(async (event) => {
    try {
        const template = await useBricksStorageAdapter().getTemplate(requireNumericId(event));

        if (!template) {
            throw createError({ statusCode: 404, statusMessage: 'Template not found' });
        }

        return template;
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch template');
    }
});
