/**
 * The shared implementation of PUT/PATCH /api/bricks/:id — both methods update only
 * the passed fields (the frontend sends a full payload on PUT and a partial one on
 * PATCH).
 */
import { createError, type H3Event } from 'h3';
import { useBricksStorageAdapter } from '../registry';
import { requireNumericId, readNormalizedBody, toPageHttpError } from './handlerHelpers';
import { withCheckedPagePath } from './pageAddressGuard';
import { validateUpdatePagePayload } from './payloadValidation';
import { getConfiguredPageAddressContext } from './pageAddressContext';
import type { IBricksPageRow } from '../../../common/types/bricks-api';

/**
 * Updates the page by the id from the request event. The conflicts are resolved by
 * the adapter atomically (the address uniqueness constraint, the expectedRevision
 * precondition) — both domain conflicts are mapped onto a 409 with a `data.code` in
 * toPageHttpError.
 *
 * @param event - The request event (PUT or PATCH).
 * @returns The updated page.
 */
export async function updatePageFromEvent(event: H3Event): Promise<IBricksPageRow> {
    const id = requireNumericId(event);

    try {
        const context = getConfiguredPageAddressContext();
        const adapter = useBricksStorageAdapter();

        const body = validateUpdatePagePayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        const result = await adapter.updatePage(
            id,
            await withCheckedPagePath(adapter, id, body, context)
        );

        if (!result) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        return result;
    } catch (error: unknown) {
        toPageHttpError(error, 'Failed to update page');
    }
}
