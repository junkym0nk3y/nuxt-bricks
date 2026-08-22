import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/:id — returns a page by id.
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const page = await useBricksStorageAdapter().getPage(id);

        if (!page) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        return page;
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch page');
    }
});
