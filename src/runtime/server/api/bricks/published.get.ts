import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../modules/persistence/server/registry';
import { toHttpError } from '../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/published — сводка опубликованных страниц
 * (включая urlPrefix/subdomain для роутинга published-страниц).
 */
export default defineEventHandler(async () => {
    try {
        return await useBricksStorageAdapter().listPublishedPages();
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch published pages');
    }
});
