import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toTemplateHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { validateUpdateTemplatePayload } from '../../../../modules/persistence/server/utils/templatePayloadValidation';

/**
 * PATCH /api/bricks/templates/:id — edits a template: its caption (the name and the
 * description, out of the rename form) and its content (the schema and the styling, out
 * of the template's editor).
 *
 * The content is written over the template as is, with no revision check: two people
 * saving one template at once keep the last save. The preview is not part of the body —
 * the editor uploads a fresh frame to `POST /api/bricks/templates/:id/thumbnail` after
 * the content is saved.
 *
 * A taken name is a 409 `TEMPLATE_NAME_CONFLICT` (the same code as on creation).
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
