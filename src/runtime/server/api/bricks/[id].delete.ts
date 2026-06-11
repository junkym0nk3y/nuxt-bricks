import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../modules/persistence/server/utils/handlerHelpers';

/**
 * DELETE /api/bricks/:id — удаляет страницу по id.
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const deleted = await useBricksStorageAdapter().deletePage(id);

        if (!deleted) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete page');
    }
});
