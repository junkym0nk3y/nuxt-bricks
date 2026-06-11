import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * DELETE /api/bricks/media/:id — удаляет метаданные медиа из БД
 * (сам файл удаляется отдельно через /mock-api/s3-delete).
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const deleted = await useBricksStorageAdapter().deleteMedia(id);

        if (!deleted) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Media item not found',
            });
        }

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete media item');
    }
});
