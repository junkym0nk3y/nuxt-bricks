/**
 * Types of the import of the publish storage's contents into the media library.
 */

import type { IMediaItem } from '../../../common/types/media';

/**
 * The outcome of an import attempt.
 *
 * A flag of its own rather than a bare list, because "empty" carries two different
 * meanings: there was nothing to import (no point in repeating) and the attempt
 * failed (worth repeating). Reducing them to one value means either remembering a
 * network failure as a completed attempt forever, or repeating a forbidden POST for
 * a role the import is not meant for.
 */
export interface IMediaStorageImportResult {
    /**
     * The contents of the media library after the import; empty — there was nothing
     * to import, or the attempt failed.
     */
    items: IMediaItem[];
    /** Whether retrying later makes sense (a temporary refusal, not one by rights) */
    isRetryable: boolean;
}
