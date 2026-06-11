import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { importMediaFromStorage } from '../../../../modules/persistence/server/utils/mediaImport';

/**
 * GET /api/bricks/media — список медиа; при пустой БД импортирует
 * существующие файлы из хранилища публикации.
 */
export default defineEventHandler(async () => {
    try {
        const items = await useBricksStorageAdapter().listMedia();

        if (items.length > 0) {
            return { success: true, items };
        }

        return { success: true, items: await importMediaFromStorage() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to load media list');
    }
});
