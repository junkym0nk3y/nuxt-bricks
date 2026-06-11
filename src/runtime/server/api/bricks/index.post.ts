import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../modules/persistence/server/utils/handlerHelpers';
import type { ICreatePagePayload } from '../../../modules/common/types/bricks-api';

/**
 * POST /api/bricks — создаёт новую страницу и возвращает её полностью.
 */
export default defineEventHandler(async (event) => {
    try {
        const body = await readNormalizedBody<ICreatePagePayload>(event);

        if (!body.schema || !body.pagename) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Pagename and schema are required',
            });
        }

        const storage = useBricksStorageAdapter();
        const duplicate = await storage.getPageByPagename(body.pagename);

        if (duplicate) {
            throw createError({
                statusCode: 409,
                statusMessage: 'Page with this pagename already exists',
            });
        }

        return await storage.createPage(body);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to publish page');
    }
});
