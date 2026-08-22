import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../modules/persistence/server/registry';
import { cleanupPageThumbnail } from '../../../modules/persistence/server/utils/mediaOrchestration';
import { prunePageThumbnails } from '../../../modules/persistence/server/utils/pageThumbnails';
import {
    requireNumericId,
    toHttpError,
} from '../../../modules/persistence/server/utils/handlerHelpers';

/**
 * DELETE /api/bricks/:id — deletes a page by id (its versions go by the database
 * cascade) and cleans up the thumbnail files in the publication storage on a
 * best-effort basis.
 *
 * The cleanup runs over the prefixes of the page with an empty list of needed
 * URLs: a page has as many frames as it has versions, and a single URL taken from
 * its row would leave the rest orphaned. The protection of recent uploads is
 * lifted here — a deleted page will get no further cleanup pass, and a deferred
 * file would stay in the storage forever. The `thumbnailUrl` itself is collected
 * by a separate call: the field is writable through PATCH, and a value outside
 * the page's own prefixes is invisible to the prefix cleanup.
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);

    try {
        const storage = useBricksStorageAdapter();
        const page = await storage.getPage(id);

        if (!page || !(await storage.deletePage(id))) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        const publish = useBricksPublishAdapter();
        await prunePageThumbnails(publish, id, [], { includeRecentUploads: true });
        await cleanupPageThumbnail(publish, page.thumbnailUrl);

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete page');
    }
});
