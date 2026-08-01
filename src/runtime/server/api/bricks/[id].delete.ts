import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../modules/persistence/server/registry';
import { cleanupPageThumbnail } from '../../../modules/persistence/server/utils/mediaOrchestration';
import { prunePageThumbnails } from '../../../modules/persistence/server/utils/pageThumbnails';
import {
    requireNumericId,
    toHttpError,
} from '../../../modules/persistence/server/utils/handlerHelpers';

/**
 * DELETE /api/bricks/:id — удаляет страницу по id (версии — каскадом БД)
 * и best-effort чистит файлы превью в хранилище публикации.
 *
 * Чистка идёт по префиксам страницы с пустым списком нужных URL: кадров у
 * страницы столько же, сколько версий, и один URL из её строки оставил бы
 * остальные сиротами. Защита свежих загрузок здесь снимается — следующего
 * прохода уборки у удалённой страницы не будет, и отложенный файл остался бы в
 * хранилище навсегда. Отдельным вызовом добирается сам `thumbnailUrl`: поле
 * доступно на запись через PATCH, и значение вне собственных префиксов
 * страницы префиксная уборка не увидит.
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

        const publish = useBricksPublishAdapter();
        await prunePageThumbnails(publish, id, [], { includeRecentUploads: true });
        await cleanupPageThumbnail(publish, page.thumbnailUrl);

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete page');
    }
});
