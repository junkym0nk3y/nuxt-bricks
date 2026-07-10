import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/:id/versions/:versionId — полный снапшот версии страницы.
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);
    const versionId = requireNumericId(event, 'versionId');

    try {
        const version = await useBricksStorageAdapter().getPageVersion(id, versionId);

        if (!version) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page version not found',
            });
        }

        return version;
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch page version');
    }
});
