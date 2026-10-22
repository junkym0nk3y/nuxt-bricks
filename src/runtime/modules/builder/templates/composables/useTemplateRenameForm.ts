// #region Imports
// Types
import type { IUseTemplateFormReturn, IUseTemplateRenameFormOptions } from '../types/templates';

// Utils
import { updateTemplateRequest } from '../utils/templatesApi';

// Composables
import { useTemplateCaptionForm } from './useTemplateCaptionForm';
// #endregion

/**
 * The form that edits the caption of a template: the caption form pointed at
 * `PATCH /api/bricks/templates/:id`.
 *
 * A form of its own rather than a mode of the saving form: that one has a source of
 * contents, the card of a page and the explanation of what a template is made of — none
 * of which is here. The two of them share a body
 * (`useTemplateCaptionForm`), not an entry point.
 *
 * @param options - The template being edited and the callback of a success.
 * @returns The fields of the form, the state of the submission and the operations.
 */
export function useTemplateRenameForm(
    options: IUseTemplateRenameFormOptions
): IUseTemplateFormReturn {
    return useTemplateCaptionForm({
        initialValues: () => ({
            name: options.template.value?.name ?? '',
            description: options.template.value?.description ?? '',
        }),
        submit: (values) => {
            const template = options.template.value;

            if (!template) {
                return null;
            }

            return updateTemplateRequest(template.id, {
                name: values.name.trim(),
                description: values.description.trim() || null,
            });
        },
        outcomeUnknownKey: 'bricks.templates.errors.renameOutcomeUnknown',
        onSaved: options.onSaved,
    });
}
