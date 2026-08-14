import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/media — список медиа.
 *
 * Чистое чтение. Прежде ручка при пустой таблице сама импортировала содержимое
 * бакета, то есть GET писал в БД: такой запрос проходит мимо CSRF-гейта
 * (безопасные методы он пропускает по определению) и достался бы роли, которой
 * разрешено только чтение. Импорт вынесен в POST /api/bricks/media/import.
 */
export default defineEventHandler(async () => {
    try {
        return { success: true, items: await useBricksStorageAdapter().listMedia() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to load media list');
    }
});
