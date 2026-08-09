import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { validateUpdateMediaPayload } from '../../../../modules/persistence/server/utils/mediaPayloadValidation';
import { assertKnownMediaCategory } from '../../../../modules/persistence/server/utils/mediaCategoryRules';

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
        const storage = useBricksStorageAdapter();

        // Существование категории проверяется до записи: FK базы отклонит
        // неизвестную и сам, но 23503 дошёл бы до клиента как 500 вместо 400.
        // null проверять нечего — это снятие категории с файла
        if (body.category) {
            await assertKnownMediaCategory(storage, body.category);
        }

        const updated = await storage.updateMedia(id, body);

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
