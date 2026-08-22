import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toTemplateHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { validateUpdateTemplatePayload } from '../../../../modules/persistence/server/utils/templatePayloadValidation';

/**
 * PATCH /api/bricks/templates/:id — edits the label of a template (its name and
 * description).
 *
 * The contents of a template are not updated by this handler: a template is an
 * imprint of a moment, and "refresh it from the current page" would mean a link
 * to the source, template versions and conflict resolution. A typo in the name,
 * on the other hand, could otherwise be fixed by nothing short of deleting and
 * saving it again.
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
