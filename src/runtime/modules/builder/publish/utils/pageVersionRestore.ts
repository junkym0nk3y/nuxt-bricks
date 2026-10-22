/**
 * Orchestration of a page rollback to a version for the publish store: the
 * revision precondition (mandatory, unlike for update/patch — see
 * `requirePageRevision`), the rollback request, synchronizing the local list and
 * bringing a 409 conflict to a readable message (`toPageWriteError`).
 *
 * The store dependency is passed as a narrow Pick contract — the logic is
 * unit-tested without Pinia (the pattern of
 * persistence/server/utils/mediaOrchestration.ts).
 */
import type { IPublishedPage } from '../../../common/types/bricks-api';
import type { IVersionRestoreStoreDeps } from '../types/publishStore';
import { restorePageVersionRequest } from './publishApi';
import { requirePageRevision, toPageWriteError } from './requestErrors';

/**
 * Rolls a page back to a version with a mandatory revision precondition.
 *
 * @param deps - Narrow contract of the store (getPageById/syncPageInList/loadAllPages).
 * @param id - Page identifier.
 * @param versionId - Version identifier.
 * @param revisionMissingMessage - Error message for a page with no revision.
 * @returns The normalized page after the rollback.
 * @throws A localized error: the revision was not found, the precondition
 * conflicted (`toPageWriteError`), or the request failed some other way.
 */
export async function restorePageVersionWithPrecondition(
    deps: IVersionRestoreStoreDeps,
    id: string | number,
    versionId: number,
    revisionMissingMessage: string
): Promise<IPublishedPage> {
    const expectedRevision = requirePageRevision(deps.getPageById(id), revisionMissingMessage);

    try {
        const normalized = await restorePageVersionRequest(id, versionId, expectedRevision);
        deps.syncPageInList(normalized);

        return normalized;
    } catch (error: unknown) {
        console.error('[Publish Store] Failed to restore page version:', error);
        throw await toPageWriteError(error, deps.loadAllPages);
    }
}
