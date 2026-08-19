import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { discardTemplateThumbnail } from '../../../../modules/persistence/server/utils/templateThumbnails';

/**
 * DELETE /api/bricks/templates/:id — удаляет шаблон (admin по матрице прав).
 *
 * Страницы, созданные из шаблона, не меняются: связи с ними нет, шаблон был
 * отпечатком. Файл превью уходит вслед за строкой — ссылок на него больше нет
 * нигде, и без уборки он остался бы в хранилище навсегда. Уборка best-effort и
 * ПОСЛЕ удаления строки: отказ хранилища не должен превращать успешное удаление
 * в ошибку, повторить которую уже нечем (шаблона нет — ручка ответит 404).
 */
export default defineEventHandler(async (event) => {
    try {
        const deleted = await useBricksStorageAdapter().deleteTemplate(requireNumericId(event));

        if (!deleted) {
            throw createError({ statusCode: 404, statusMessage: 'Template not found' });
        }

        await discardTemplateThumbnail(useBricksPublishAdapter(), deleted.thumbnailUrl);

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete template');
    }
});
