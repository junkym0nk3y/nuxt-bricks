import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/media/categories — the media library categories in display
 * order.
 *
 * The `{ success, items }` envelope matches GET /api/bricks/media: the client
 * tells an empty list from an unrecognized response instead of reading the second
 * as the first.
 */
export default defineEventHandler(async () => {
    try {
        return { success: true, items: await useBricksStorageAdapter().listMediaCategories() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to load media categories');
    }
});
