import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toMediaHttpError,
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

        // Существование категории проверяется до записи ради раннего отказа;
        // гонку с удалением категории ловит уже FK базы, и оба пути дают
        // клиенту один ответ. null проверять нечего — это снятие категории
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
        toMediaHttpError(error, 'Failed to patch media item');
    }
});
