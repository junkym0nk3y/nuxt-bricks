// #region Imports
// Types
import type { IApiFetcher } from '../../../common/types/composables';
import type { TRequestErrorLike } from '../../../common/types/bricks-api';
import type { IMediaStorageImportResult } from '../types/storageImport';

// Utils
import { isMediaListResponse } from './requestErrors';
// #endregion

// #region Data
/** Refusal by rights: a role below administrator has no import and never will */
const FORBIDDEN_STATUS = 403;
// #endregion

/**
 * Asks the server to register in the media library the files that already lie in
 * the publish storage.
 *
 * Why this is a POST of its own and not the list endpoint doing the import itself —
 * see `server/api/bricks/media/import.post.ts`, where that history and the `admin`
 * requirement are written down.
 *
 * The refusal is not shown to the user — an import is not what the gallery was
 * opened for — but the outcomes differ. 403 is final: an observer and an editor have
 * no such right, and repeating a forbidden POST on every opening of an empty gallery
 * is pointless. The rest (a broken connection, a 5xx, an unrecognized response) count
 * as temporary: reducing them to the same "do not try again" would mean that a single
 * network failure leaves an administrator with an empty gallery until the page is
 * reloaded.
 *
 * @param apiFetcher - The bricks-API client.
 * @returns The contents of the media library, and whether retrying makes sense.
 */
export async function requestMediaStorageImport(
    apiFetcher: IApiFetcher
): Promise<IMediaStorageImportResult> {
    try {
        const response = await apiFetcher<unknown>('/api/bricks/media/import', {
            method: 'POST',
        });

        if (isMediaListResponse(response)) {
            return { items: response.items, isRetryable: false };
        }

        // An unrecognized response shape is no proof that the server refused: the
        // import could well have gone through, so the attempt is not buried
        console.warn('[Media Store] Unexpected storage import response shape');

        return { items: [], isRetryable: true };
    } catch (error: unknown) {
        console.warn('[Media Store] Storage import skipped:', error);

        return {
            items: [],
            isRetryable: (error as TRequestErrorLike).statusCode !== FORBIDDEN_STATUS,
        };
    }
}
