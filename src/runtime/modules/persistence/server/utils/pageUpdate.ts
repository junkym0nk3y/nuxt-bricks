/**
 * Общая реализация PUT/PATCH /api/bricks/:id — оба метода обновляют
 * только переданные поля (фронт шлёт полный payload на PUT и частичный на PATCH).
 */
import { createError, type H3Event } from 'h3';
import { useBricksStorageAdapter } from '../registry';
import { requireNumericId, readNormalizedBody, toPageHttpError } from './handlerHelpers';
import { withCheckedPagePath } from './pageAddressGuard';
import { validateUpdatePagePayload } from './payloadValidation';
import { getConfiguredPageAddressContext } from './pageAddressContext';
import type { IBricksPageRow } from '../../../common/types/bricks-api';

/**
 * Обновляет страницу по id из события запроса. Конфликты разруливает адаптер
 * атомарно (constraint pagename, precondition expectedRevision) — оба доменных
 * конфликта маппятся на 409 с `data.code` в toPageHttpError.
 *
 * @param event - Событие запроса (PUT или PATCH).
 * @returns Обновлённая страница.
 */
export async function updatePageFromEvent(event: H3Event): Promise<IBricksPageRow> {
    const id = requireNumericId(event);

    try {
        const context = getConfiguredPageAddressContext();
        const adapter = useBricksStorageAdapter();

        const body = validateUpdatePagePayload(
            await readNormalizedBody<Record<string, unknown>>(event),
            context
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
