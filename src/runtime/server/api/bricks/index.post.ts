import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toPageHttpError,
} from '../../../modules/persistence/server/utils/handlerHelpers';
import { validateCreatePagePayload } from '../../../modules/persistence/server/utils/payloadValidation';
import { getConfiguredPageAddressContext } from '../../../modules/persistence/server/utils/pageAddressContext';

/**
 * POST /api/bricks — creates a new page and returns it in full.
 * Address uniqueness is enforced by a database constraint: a race of simultaneous
 * creates is caught as BricksPageAddressConflictError → 409 (no pre-check SELECT
 * is needed).
 */
export default defineEventHandler(async (event) => {
    try {
        const body = validateCreatePagePayload(
            await readNormalizedBody<Record<string, unknown>>(event),
            getConfiguredPageAddressContext()
        );

        return await useBricksStorageAdapter().createPage(body);
    } catch (error: unknown) {
        toPageHttpError(error, 'Failed to publish page');
    }
});
