import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { importMediaFromStorage } from '../../../../modules/persistence/server/utils/mediaImport';

/**
 * POST /api/bricks/media/import — registers in the media library the files that
 * lie in the managed prefix of the storage but are absent from the database.
 *
 * Split out of the GET list: there the import was a write under a safe method
 * (past the CSRF gate and past the separation of rights). It requires `admin` —
 * the operation is a bulk one and creates records for the whole prefix at once,
 * not for the file an editor is working with.
 *
 * Idempotent: `createMedia` of the default adapter returns the existing record on
 * a url conflict, so a repeated call creates no duplicates.
 *
 * The response is the media library AFTER the import — the whole of it, not the
 * records this call added: the caller refreshes the gallery from it, and a delta
 * would leave it to merge two lists. The import result itself is deliberately not
 * inspected. An unreachable storage yields no records and no error either, so
 * that a failure of the bucket does not look like a failure of the media library.
 */
export default defineEventHandler(async () => {
    try {
        await importMediaFromStorage();

        return { success: true, items: await useBricksStorageAdapter().listMedia() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to import media from storage');
    }
});
