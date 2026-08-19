import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/templates/:id — полный шаблон со схемой и оформлением.
 *
 * Нужен ровно одному сценарию — созданию страницы из шаблона: сводка списка
 * схему не несёт, а отдавать её всем карточкам разом значило бы возить мегабайты
 * ради сетки превью.
 */
export default defineEventHandler(async (event) => {
    try {
        const template = await useBricksStorageAdapter().getTemplate(requireNumericId(event));

        if (!template) {
            throw createError({ statusCode: 404, statusMessage: 'Template not found' });
        }

        return template;
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch template');
    }
});
