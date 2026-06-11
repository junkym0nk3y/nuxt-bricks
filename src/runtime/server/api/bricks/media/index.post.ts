import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import type { ICreateMediaPayload } from '../../../../modules/persistence/types/adapters';

/**
 * POST /api/bricks/media — сохраняет метаданные загруженного файла
 * (сам файл уже загружен через /mock-api/s3-image).
 */
export default defineEventHandler(async (event) => {
    try {
        const body = await readNormalizedBody<ICreateMediaPayload>(event);

        if (!body.url || !body.filename) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Url and filename are required',
            });
        }

        return await useBricksStorageAdapter().createMedia(body);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to save media item');
    }
});
