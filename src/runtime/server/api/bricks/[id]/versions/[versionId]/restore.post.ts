import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    readNormalizedBody,
    toPageHttpError,
} from '../../../../../../modules/persistence/server/utils/handlerHelpers';
import { validateRestoreVersionPayload } from '../../../../../../modules/persistence/server/utils/payloadValidation';
import { restorePageVersion } from '../../../../../../modules/persistence/server/utils/pageVersionRestore';

/**
 * POST /api/bricks/:id/versions/:versionId/restore — rolls a page back to a version.
 *
 * Applies the state the page renders from: schema, layout, backgroundColor,
 * thumbnailUrl and viewportConfig (the reasons the last two travel with the
 * schema are spelled out in `pageVersionRestore.ts`). The address, the title, the
 * SEO fields and `published` are left alone — no address uniqueness conflicts and
 * no unexpected SEO rollbacks. It goes through updatePage, which snapshots the
 * current state before the rollback itself — so "rolling back the rollback" works
 * with no extra code.
 *
 * Optimistic locking: the request body must carry `expectedRevision` (a
 * precondition, NOT a writable field) — a mismatch with the current revision of
 * the page gives a 409 `data.code=REVISION_CONFLICT` through toPageHttpError and
 * changes nothing. Unlike PUT/PATCH `/api/bricks/:id`, here the precondition is
 * mandatory rather than optional — before this handler restore quietly
 * overwrote concurrent edits, sending a POST with no body at all.
 *
 * The remaining mutations of versioned page state are deliberately
 * last-write-wins, with no precondition: DELETE `/api/bricks/:id`, the
 * thumbnail-only PATCH (the fire-and-forget preview after a canvas snapshot) and
 * the `published` toggle — single-field operations that overwrite no content.
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);
    const versionId = requireNumericId(event, 'versionId');

    try {
        const { expectedRevision } = validateRestoreVersionPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        return await restorePageVersion(
            { storage: useBricksStorageAdapter() },
            id,
            versionId,
            expectedRevision
        );
    } catch (error: unknown) {
        toPageHttpError(error, 'Failed to restore page version');
    }
});
