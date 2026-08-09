import { createError, defineEventHandler, getRouterParam } from 'h3';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import { validateMediaCategory } from '../../../../../modules/persistence/server/utils/mediaPayloadValidation';

/**
 * DELETE /api/bricks/media/categories/:slug — удаляет категорию, сняв её с
 * файлов.
 *
 * Неудаляемых категорий нет: набор целиком заводит пользователь, приёмника для
 * осиротевших файлов не существует. Сами файлы не удаляются — они остаются в
 * медиатеке без категории и видны в фильтре «Все»; ответ говорит, скольких это
 * коснулось.
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
