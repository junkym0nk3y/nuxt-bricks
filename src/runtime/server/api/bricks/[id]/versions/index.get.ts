import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/:id/versions — сводки сохранённых версий страницы (без schema).
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        return await useBricksStorageAdapter().listPageVersions(id);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch page versions');
    }
});
