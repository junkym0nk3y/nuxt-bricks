import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/media/categories — категории медиатеки в порядке показа.
 *
 * Envelope `{ success, items }` — как у GET /api/bricks/media: клиент отличает
 * пустой список от нераспознанного ответа, а не трактует второе как первое.
 */
export default defineEventHandler(async () => {
    try {
        return { success: true, items: await useBricksStorageAdapter().listMediaCategories() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to load media categories');
    }
});
