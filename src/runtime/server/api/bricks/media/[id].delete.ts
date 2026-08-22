import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import { deleteMediaWithFile } from '../../../../modules/persistence/server/utils/mediaOrchestration';
import {
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * DELETE /api/bricks/media/:id — deletes the file from the publication storage
 * and the metadata from the database in one request (file first: on a storage
 * error it answers 502, the record stays and the operation retries safely).
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const deleted = await deleteMediaWithFile(
            { storage: useBricksStorageAdapter(), publish: useBricksPublishAdapter() },
            id
        );

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
