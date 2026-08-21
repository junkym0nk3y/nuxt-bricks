/**
 * Orchestration of rolling a page back to a saved version (POST .../restore).
 *
 * Applies the schema + layout + backgroundColor + thumbnailUrl + the device set:
 * pagename/title/SEO/published are left alone (no pagename uniqueness conflicts and
 * no unexpected SEO rollbacks). Goes through storage.updatePage, which snapshots the
 * current state before the rollback itself (an "undo of the undo" for free) and
 * applies optimistic locking by expectedRevision — a mismatch throws
 * BricksRevisionConflictError (mapped onto a 409 REVISION_CONFLICT in toPageHttpError
 * at the handler).
 *
 * The dependency is passed as a parameter (a narrow Pick contract) — the logic is
 * unit-tested without a real Postgres (the mediaOrchestration.ts pattern).
 */
import { createError } from 'h3';
import type { IBricksPageRow } from '../../../common/types/bricks-api';
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type { IStorageAdapter } from '../../types/adapters';
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';
import { validateDeviceSet } from '../../../common/utils/bricks/devices';

/**
 * The dependencies of the page version rollback orchestration.
 */
export interface IPageVersionRestoreDeps {
    storage: Pick<IStorageAdapter, 'getPageVersion' | 'updatePage'>;
}

/**
 * Checks the device set stored in the version before the rollback.
 *
 * A corrupted set is a refusal rather than a silent replacement by inheritance: the
 * `props.responsive` keys in the version's schema belong to its set, and restoring the
 * schema without it means returning the page to a state where the blocks' overrides
 * point at nonexistent steps. That is exactly why the set is stored in the version.
 * A schema with a broken contract is rejected right alongside it for the same reason.
 *
 * @param stored - The `viewport_config` value from the version's snapshot.
 * @returns The device set, or `null` (a version of an inheriting page).
 * @throws An h3 400 error — the stored set does not pass the contract.
 */
function resolveStoredViewportConfig(stored: unknown): TBricksPageDeviceSet | null {
    if (stored === null || stored === undefined) {
        return null;
    }

    const validation = validateDeviceSet(stored);

    if (!validation.ok) {
        throw createError({
            statusCode: 400,
            statusMessage: `Stored version viewport config is invalid: ${validation.errors
                .slice(0, 3)
                .join('; ')}`,
        });
    }

    return validation.value;
}

/**
 * Rolls a page back to the given version, checking the revision precondition.
 *
 * @param deps - The storage adapter (a narrow contract).
 * @param pageId - The page identifier.
 * @param versionId - The version identifier (must belong to pageId).
 * @param expectedRevision - The optimistic locking precondition.
 * @returns The updated page.
 * @throws An h3 404 error — the version or the page was not found;
 * an h3 400 error — the stored version carries a schema failing the structural
 * contract of the component graph (see schemaContract.ts) — such a version cannot be
 * rolled back to without restoring a broken render along with it;
 * BricksRevisionConflictError — the precondition did not match the current revision.
 */
export async function restorePageVersion(
    deps: IPageVersionRestoreDeps,
    pageId: number,
    versionId: number,
    expectedRevision: number
): Promise<IBricksPageRow> {
    const version = await deps.storage.getPageVersion(pageId, versionId);

    if (!version) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Page version not found',
        });
    }

    const contractErrors = Array.isArray(version.schema?.components)
        ? validateSchemaComponentGraph(version.schema.components)
        : ['Field "schema.components" must be an array'];

    if (contractErrors.length > 0) {
        throw createError({
            statusCode: 400,
            statusMessage: `Stored version schema is invalid: ${contractErrors
                .slice(0, 3)
                .join('; ')}`,
        });
    }

    // The preview travels along with the schema, `null` included: the page's content
    // after the rollback is the version's content, and the former frame would show
    // what is no longer on the page. For a version with no snapshot a placeholder is
    // more honest than somebody else's picture; the page will get a frame of its own
    // at the very first save from the builder. The frame of the state the rollback
    // pushes out is not lost — it is carried off by the snapshot updatePage makes
    // before the write.
    // The device set travels along with the schema: the `props.responsive` keys in the
    // snapshot belong to the set it was taken under, and a rollback of the schema
    // without the set would give a page where the blocks' overrides point at
    // nonexistent steps. `null` is restored as it is — a version of an inheriting page
    // stays inheriting
    const restoredViewportConfig = resolveStoredViewportConfig(version.viewportConfig);

    const result = await deps.storage.updatePage(pageId, {
        schema: version.schema,
        layout: version.layout,
        backgroundColor: version.backgroundColor,
        thumbnailUrl: version.thumbnailUrl,
        viewportConfig: restoredViewportConfig,
        expectedRevision,
    });

    if (!result) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Page not found',
        });
    }

    return result;
}
