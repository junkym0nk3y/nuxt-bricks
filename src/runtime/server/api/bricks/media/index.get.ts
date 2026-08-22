import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/media — the media list.
 *
 * A pure read. The handler used to import the contents of the bucket itself when
 * the table was empty, that is, a GET wrote to the database: such a request
 * passes by the CSRF gate (which lets safe methods through by definition) and
 * would have been available to a role allowed to read only. The import was moved
 * out into POST /api/bricks/media/import.
 */
export default defineEventHandler(async () => {
    try {
        return { success: true, items: await useBricksStorageAdapter().listMedia() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to load media list');
    }
});
