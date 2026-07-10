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
 * DELETE /api/bricks/media/:id — удаляет файл из хранилища публикации и
 * метаданные из БД одним запросом (file-first: при ошибке хранилища — 502,
 * запись остаётся и операция безопасно ретраится).
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
