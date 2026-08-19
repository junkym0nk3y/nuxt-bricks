import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toTemplateHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { validateUpdateTemplatePayload } from '../../../../modules/persistence/server/utils/templatePayloadValidation';

/**
 * PATCH /api/bricks/templates/:id — правит подпись шаблона (имя и описание).
 *
 * Содержимое шаблона этой ручкой не обновляется: шаблон — отпечаток момента, а
 * «обновить его текущей страницей» означало бы связь с источником, версии
 * шаблона и разрешение конфликтов. Опечатку же в имени иначе было бы не
 * исправить ничем, кроме удаления и повторного сохранения.
 *
 * Занятое имя — 409 `TEMPLATE_NAME_CONFLICT` (тот же код, что у создания).
 */
export default defineEventHandler(async (event) => {
    try {
        const templateId = requireNumericId(event);
        const payload = validateUpdateTemplatePayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        const template = await useBricksStorageAdapter().updateTemplate(templateId, payload);

        if (!template) {
            throw createError({ statusCode: 404, statusMessage: 'Template not found' });
        }

        return template;
    } catch (error: unknown) {
        toTemplateHttpError(error, 'Failed to update template');
    }
});
