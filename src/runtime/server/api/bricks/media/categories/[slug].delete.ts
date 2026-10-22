import { createError, defineEventHandler, getRouterParam } from 'h3';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import { validateMediaCategory } from '../../../../../modules/persistence/server/utils/mediaPayloadValidation';

/**
 * DELETE /api/bricks/media/categories/:slug — deletes a category, clearing it off
 * the files.
 *
 * There are no undeletable categories: the whole set is created by the user, and
 * no receiving category exists for the orphaned files. The files themselves are
 * not deleted — they stay in the media library without a category and are visible
 * under the "All" filter; the response reports how many of them were affected.
 */
export default defineEventHandler(async (event) => {
    try {
        const slug = validateMediaCategory(getRouterParam(event, 'slug'));
        const storage = useBricksStorageAdapter();

        const result = await storage.deleteMediaCategory(slug);

        if (!result) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Media category not found',
            });
        }

        return { success: true, clearedCount: result.clearedCount };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete media category');
    }
});
