import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import type { TUpdateMediaPayload } from '../../../../modules/persistence/types/adapters';

/**
 * PATCH /api/bricks/media/:id — частично обновляет метаданные медиа
 * (filename / alt / category).
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const body = await readNormalizedBody<TUpdateMediaPayload>(event);
        const updated = await useBricksStorageAdapter().updateMedia(id, {
            filename: body.filename,
            alt: body.alt,
            category: body.category,
        });

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
