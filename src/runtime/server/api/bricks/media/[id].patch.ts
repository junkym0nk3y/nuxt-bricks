import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { validateUpdateMediaPayload } from '../../../../modules/persistence/server/utils/mediaPayloadValidation';

/**
 * PATCH /api/bricks/media/:id — частично обновляет метаданные медиа
 * (filename / alt / category).
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const body = validateUpdateMediaPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        const updated = await useBricksStorageAdapter().updateMedia(id, body);

        if (!updated) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Media item not found',
            });
        }

        return updated;
    } catch (error: unknown) {
        toHttpError(error, 'Failed to patch media item');
    }
});
