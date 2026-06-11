/**
 * Общая реализация PUT/PATCH /api/bricks/:id — оба метода обновляют
 * только переданные поля (фронт шлёт полный payload на PUT и частичный на PATCH).
 */
import { createError, type H3Event } from 'h3';
import { useBricksStorageAdapter } from '../registry';
import { requireNumericId, readNormalizedBody, toHttpError } from './handlerHelpers';
import type { IBricksPageRow, IUpdatePagePayload } from '../../../common/types/bricks-api';

/**
 * Обновляет страницу по id из события запроса.
 *
 * @param event - Событие запроса (PUT или PATCH).
 * @returns Обновлённая страница.
 */
export async function updatePageFromEvent(event: H3Event): Promise<IBricksPageRow> {
    const id = requireNumericId(event);

    try {
        const body = await readNormalizedBody<IUpdatePagePayload>(event);
        const storage = useBricksStorageAdapter();

        if (body.pagename) {
            const duplicate = await storage.getPageByPagename(body.pagename);

            if (duplicate && duplicate.id !== id) {
                throw createError({
                    statusCode: 409,
                    statusMessage: 'Page with this pagename already exists',
                });
            }
        }

        if (Object.values(body).every((value) => value === undefined)) {
            throw createError({
                statusCode: 400,
                statusMessage: 'No fields to update',
            });
        }

        const result = await storage.updatePage(id, body);

        if (!result) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        return result;
    } catch (error: unknown) {
        toHttpError(error, 'Failed to update page');
    }
}
