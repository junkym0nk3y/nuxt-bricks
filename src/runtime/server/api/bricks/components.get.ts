import { createError, defineEventHandler, getQuery } from 'h3';
import { resolveBricksComponents } from '../../utils/bricksComponents';

/**
 * GET /api/bricks/components — возвращает весь манифест или компоненты
 * выбранной категории. Открыта для чтения без auth (см. routeProtection.ts):
 * отдаёт только имена, категории и пути brick-файлов, и нужна SSR билдера
 * в basic-режиме (useApiClient не пробрасывает Authorization).
 */
export default defineEventHandler(async (event) => {
    const { category } = getQuery(event);

    // Повторённый ?category=a&category=b приходит массивом — это ошибка клиента,
    // а не запрос «весь манифест»
    if (category !== undefined && typeof category !== 'string') {
        throw createError({
            statusCode: 400,
            message: 'category must be a single value',
        });
    }

    return await resolveBricksComponents(category || undefined);
});
