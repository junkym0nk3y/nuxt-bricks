import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toPageHttpError,
} from '../../../modules/persistence/server/utils/handlerHelpers';
import { validateCreatePagePayload } from '../../../modules/persistence/server/utils/payloadValidation';
import { getConfiguredPageAddressContext } from '../../../modules/persistence/server/utils/pageAddressContext';

/**
 * POST /api/bricks — создаёт новую страницу и возвращает её полностью.
 * Уникальность pagename обеспечивает constraint БД: гонку одновременных
 * create ловит BricksPagenameConflictError → 409 (pre-check SELECT не нужен).
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
