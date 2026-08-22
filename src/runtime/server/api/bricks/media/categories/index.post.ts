import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../../modules/persistence/server/utils/handlerHelpers';
import { validateCreateMediaCategoryPayload } from '../../../../../modules/persistence/server/utils/mediaPayloadValidation';

/**
 * POST /api/bricks/media/categories — creates a user category.
 *
 * The slug is derived from the label on the server (see
 * validateCreateMediaCategoryPayload). Repeating an existing slug returns the
 * existing record rather than a 409: the UI state is the same in both branches,
 * and a double click on "confirm" must not show an error over a category that was
 * created successfully. The UI catches a duplicate itself — by matching the typed
 * label against the row of chips already on screen.
 */
export default defineEventHandler(async (event) => {
    try {
        const payload = validateCreateMediaCategoryPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        return await useBricksStorageAdapter().createMediaCategory(payload);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to create media category');
    }
});
