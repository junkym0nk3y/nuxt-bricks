// #region Imports
// Types
import type { IUseTemplateFormReturn, IUseTemplateSaveFormOptions } from '../types/templates';

// Utils
import { createTemplateRequest } from '../utils/templatesApi';

// Composables
import { useTemplateCaptionForm } from './useTemplateCaptionForm';
// #endregion

/**
 * The "Save as template" form: the caption form pointed at
 * `POST /api/bricks/templates`.
 *
 * The contents arrive as the source (`options.source`) rather than being assembled
 * here: the entry points bring different things — the saved schema of a page against
 * the current canvas — and the form has nothing to do with that difference.
 *
 * @param options - The source of the contents and the callback of a success.
 * @returns The fields of the form, the state of the submission and the operations.
 */
export function useTemplateSaveForm(options: IUseTemplateSaveFormOptions): IUseTemplateFormReturn {
    return useTemplateCaptionForm({
        initialValues: () => ({
            name: options.source.value?.suggestedName ?? '',
            description: options.source.value?.suggestedDescription ?? '',
        }),
        submit: (values) => {
            const source = options.source.value;

            if (!source) {
                return null;
            }

            return createTemplateRequest({
                name: values.name.trim(),
                description: values.description.trim() || null,
                schema: source.schema,
                pageMeta: source.pageMeta,
                thumbnailSourceUrl: source.thumbnailSourceUrl,
            });
        },
        outcomeUnknownKey: 'bricks.templates.errors.saveOutcomeUnknown',
        onSaved: options.onSaved,
    });
}
