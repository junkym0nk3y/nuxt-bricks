import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../modules/persistence/server/registry';
import { toHttpError } from '../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks — сводки всех страниц билдера (без `schema`).
 * Полную строку со схемой отдаёт point-lookup GET /api/bricks/:id.
 */
export default defineEventHandler(async () => {
    try {
        return await useBricksStorageAdapter().listPages();
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch pages');
    }
});
