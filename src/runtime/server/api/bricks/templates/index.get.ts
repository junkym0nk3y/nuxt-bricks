import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * GET /api/bricks/templates — сводки шаблонов для раздела «Шаблоны» и выбора
 * источника новой страницы (без `schema` и `pageMeta`, с числом блоков).
 *
 * Envelope `{ templates }`, а не голый массив: раздел читает список тем же
 * композаблом, что и учётки, и одинаковая форма ответа избавляет их от двух
 * разных разборов. Полный шаблон отдаёт point-lookup `GET /templates/:id`.
 */
export default defineEventHandler(async () => {
    try {
        return { templates: await useBricksStorageAdapter().listTemplates() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch templates');
    }
});
