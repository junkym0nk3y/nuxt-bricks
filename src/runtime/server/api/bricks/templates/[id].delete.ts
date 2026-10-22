import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { discardTemplateThumbnail } from '../../../../modules/persistence/server/utils/templateThumbnails';

/**
 * DELETE /api/bricks/templates/:id — deletes a template (admin by the access
 * matrix).
 *
 * The pages created from the template do not change: there is no link to them,
 * the template was an imprint. The thumbnail file goes away after the row —
 * nothing points at it any more, and without the cleanup it would stay in the
 * storage forever. The cleanup is best-effort and runs AFTER the row is deleted: a
 * storage failure must not turn a successful deletion into an error that can no
 * longer be retried (the template is gone, so the handler would answer 404).
 */
export default defineEventHandler(async (event) => {
    try {
        const deleted = await useBricksStorageAdapter().deleteTemplate(requireNumericId(event));

        if (!deleted) {
            throw createError({ statusCode: 404, statusMessage: 'Template not found' });
        }

        await discardTemplateThumbnail(useBricksPublishAdapter(), deleted.thumbnailUrl, {
            repeatOnFailure: true,
        });

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete template');
    }
});
