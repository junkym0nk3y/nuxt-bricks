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
 * PATCH /api/bricks/media/:id — partially updates the media metadata
 * (filename / alt / category).
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const body = validateUpdateMediaPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        const storage = useBricksStorageAdapter();

        // The existence of the category is checked before the write for an early
        // refusal; the race with the deletion of a category is caught by the
        // database FK, and both paths give the client one and the same answer.
        // There is nothing to check for null — that is the removal of a category
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
