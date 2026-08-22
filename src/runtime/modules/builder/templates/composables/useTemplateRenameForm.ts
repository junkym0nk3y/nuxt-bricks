// #region Imports
// Types
import type { ITemplateFormValues, IUseTemplateRenameFormOptions } from '../types/templates';

// Utils
import { createTemplateValidationSchema } from '../utils/validationSchema';
import { updateTemplateRequest } from '../utils/templatesApi';
import { isTemplateNameTakenError, resolveTemplateActionErrorKey } from '../utils/templateErrors';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { toTemplateSummary } from '../utils/templateSummary';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useTemplatesData } from './useTemplatesData';

// Vee-validate
import { useForm } from 'vee-validate';
// #endregion

/**
 * The form that edits the caption of a template: the same name and description as when
 * saving, but a PATCH of a record that already exists.
 *
 * A form of its own rather than a mode of the saving form: that one has a source of
 * contents, the card of a page and the explanation of what a template is made of — none
 * of which is here. The price of the split is a copy: only the schema of the validation
 * has been taken out into a utility, while the generation of the submission, the ladder
 * of refusals and the reset repeat the saving form line for line.
 *
 * @param options - The template being edited and the callback of a success.
 * @returns The fields of the form, the state of the submission and the operations.
 */
export function useTemplateRenameForm(options: IUseTemplateRenameFormOptions) {
    // #region Data
    const { t } = useI18n();
    const { upsertTemplate, refreshTemplates } = useTemplatesData();

    const validationSchema = createTemplateValidationSchema({
        t: (key, params) => t(key, params ?? {}),
    });

    const {
        defineField,
        handleSubmit,
        resetForm: resetVeeForm,
        setFieldError,
        errors,
    } = useForm<ITemplateFormValues>({
        validationSchema,
        initialValues: { name: '', description: '' },
    });

    const [name] = defineField('name');
    const [description] = defineField('description');

    const isSubmitting = ref(false);
    const generalError = ref('');
    /** Generation of the submission — see the saving form for what it guards and why */
    const submissionGeneration = ref(0);
    // #endregion

    // #region Methods
    /**
     * Validates the form and saves the caption.
     *
     * A taken name goes under the field; hitting the ceiling of the wait means the
     * outcome is unknown (the server may have applied the edit), so the list is re-read
     * instead of a refusal being announced.
     */
    const submitForm = handleSubmit(async (values) => {
        const template = options.template.value;

        if (isSubmitting.value || !template) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';
        submissionGeneration.value += 1;

        const generation = submissionGeneration.value;

        try {
            const updated = await updateTemplateRequest(template.id, {
                name: values.name.trim(),
                description: values.description.trim() || null,
            });

            upsertTemplate(toTemplateSummary(updated));

            if (generation !== submissionGeneration.value) {
                return;
            }

            options.onSaved(toTemplateSummary(updated));
        } catch (error: unknown) {
            if (generation !== submissionGeneration.value) {
                return;
            }

            if (isTemplateNameTakenError(error)) {
                setFieldError('name', t('bricks.templates.errors.nameTaken'));
                return;
            }

            if (isRequestTimeoutError(error)) {
                generalError.value = t('bricks.templates.errors.renameOutcomeUnknown');
                await refreshTemplates();
                return;
            }

            generalError.value = t(resolveTemplateActionErrorKey(error));
        } finally {
            if (generation === submissionGeneration.value) {
                isSubmitting.value = false;
            }
        }
    });

    /** Puts the current caption of the template into the form (on opening the modal) */
    function resetForm(): void {
        submissionGeneration.value += 1;

        resetVeeForm({
            values: {
                name: options.template.value?.name ?? '',
                description: options.template.value?.description ?? '',
            },
        });
        generalError.value = '';
        isSubmitting.value = false;
    }
    // #endregion

    return {
        name,
        description,
        errors,
        generalError,
        isSubmitting,
        submitForm,
        resetForm,
    };
}
