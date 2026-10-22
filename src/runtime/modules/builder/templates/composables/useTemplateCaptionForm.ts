// #region Imports
// Types
import type {
    ITemplateFormValues,
    IUseTemplateCaptionFormOptions,
    IUseTemplateFormReturn,
} from '../types/templates';

// Utils
import { createTemplateValidationSchema } from '../utils/validationSchema';
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
 * The body shared by the two caption forms of a template: the validation by the common
 * schema, the ladder that tells the refusals apart, and the edit of the list by the
 * answer of the endpoint.
 *
 * Left to the caller are the three things saving and renaming actually differ in — the
 * values a reset fills the form with, the request itself and the key of the text for an
 * aborted wait. Everything else stood copied line for line in the two of them.
 *
 * @param options - The values of a reset, the request, the key of an uncertain outcome
 *   and the callback of a success.
 * @returns The fields of the form, the state of the submission and the operations.
 */
export function useTemplateCaptionForm(
    options: IUseTemplateCaptionFormOptions
): IUseTemplateFormReturn {
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
    // #endregion

    // #region Methods
    /**
     * Validates the form and sends the caption.
     *
     * A taken name goes under the field rather than into the general text: it is the
     * only refusal that belongs to one particular field. Whether a name is taken cannot
     * be checked in advance — the list in the browser is a copy, and another editor may
     * have taken the name.
     *
     * Hitting the ceiling of the wait is handled on its own: the server may have applied
     * the edit and failed to answer in time, so the list is re-read and the person is
     * told that the outcome is uncertain — "it did not work" would be untrue, and a
     * second attempt would run into the name it had itself taken.
     */
    const submitForm = handleSubmit<void>(async (values) => {
        if (isSubmitting.value) {
            return;
        }

        // Asked for before the busy state goes up: with no record behind the form there
        // is nothing to send, and a form that shut itself down would have to be reset
        const request = options.submit(values);

        if (!request) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';

        try {
            // The list is edited whatever happened next: the template exists, and hiding
            // it from the section merely because the window was closed in time would be
            // a lie
            const template = toTemplateSummary(await request);

            upsertTemplate(template);

            options.onSaved(template);
        } catch (error: unknown) {
            if (isTemplateNameTakenError(error)) {
                setFieldError('name', t('bricks.templates.errors.nameTaken'));
                return;
            }

            if (isRequestTimeoutError(error)) {
                generalError.value = t(options.outcomeUnknownKey);
                await refreshTemplates();
                return;
            }

            generalError.value = t(resolveTemplateActionErrorKey(error));
        } finally {
            isSubmitting.value = false;
        }
    });

    /**
     * Puts the caption of the record into the form (on the opening of the modal).
     *
     * The values are asked for on every reset rather than remembered when the form was
     * built: one and the same window serves one record after another, and the values of
     * the first of them would greet the second.
     */
    function resetForm(): void {
        resetVeeForm({ values: options.initialValues() });
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
