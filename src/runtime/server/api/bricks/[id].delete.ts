import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../modules/persistence/server/registry';
import { cleanupPageThumbnail } from '../../../modules/persistence/server/utils/mediaOrchestration';
import {
    requireNumericId,
    toHttpError,
} from '../../../modules/persistence/server/utils/handlerHelpers';

/**
 * DELETE /api/bricks/:id — удаляет страницу по id (версии — каскадом БД)
 * и best-effort чистит файл превью в хранилище публикации.
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const storage = useBricksStorageAdapter();
        const page = await storage.getPage(id);

        if (!page || !(await storage.deletePage(id))) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        await cleanupPageThumbnail(useBricksPublishAdapter(), page.thumbnailUrl);

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete page');
    }
});
