// #region Imports
// Types
import type { ITemplateFormValues, IUseTemplateSaveFormOptions } from '../types/templates';

// Utils
import { createTemplateValidationSchema } from '../utils/validationSchema';
import { createTemplateRequest } from '../utils/templatesApi';
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
 * The "Save as template" form: validation by the shared schema, creation through
 * `POST /api/bricks/templates`, refusals told apart by what they mean.
 *
 * The contents arrive as the source (`options.source`) rather than being assembled
 * here: the entry points bring different things — the saved schema of a page against
 * the current canvas — and the form has nothing to do with that difference.
 *
 * @param options - The source of the contents and the callback of a success.
 * @returns The fields of the form, the state of the submission and the operations.
 */
export function useTemplateSaveForm(options: IUseTemplateSaveFormOptions) {
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

    /**
     * The generation of the submission: a reset of the form declares every submission
     * still in flight somebody else's, so a late answer cannot write into a form that
     * is no longer the one it was sent from.
     *
     * The interface leaves no way there today — while a request runs, the closing of
     * the modal is refused (`handleClose`), and the cross and the Cancel button are
     * disabled, so the form cannot be reset from under a submission at all. The counter
     * stands as a precaution, not as a fix for an observed defect.
     */
    const submissionGeneration = ref(0);
    // #endregion

    // #region Methods
    /**
     * Validates the form and saves the template.
     *
     * A taken name goes under the field rather than into the general text: it is the
     * only refusal that belongs to one particular field. Whether a name is taken cannot
     * be checked in advance — the list in the browser is a copy, and another editor may
     * have taken the name.
     *
     * Hitting the ceiling of the wait is handled on its own: the server may have saved
     * the template and failed to answer in time, so the list is re-read and the person
     * is told that the outcome is uncertain — "it did not work" would be untrue, and a
     * second attempt would run into the name it had itself taken.
     */
    const submitForm = handleSubmit(async (values) => {
        const source = options.source.value;

        if (isSubmitting.value || !source) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';
        submissionGeneration.value += 1;

        const generation = submissionGeneration.value;

        try {
            const created = await createTemplateRequest({
                name: values.name.trim(),
                description: values.description.trim() || null,
                schema: source.schema,
                pageMeta: source.pageMeta,
                thumbnailSourceUrl: source.thumbnailSourceUrl,
            });

            // The list is edited whatever happened next: the template exists, and
            // hiding it from the section merely because the window was closed in time
            // would be a lie
            upsertTemplate(toTemplateSummary(created));

            if (generation !== submissionGeneration.value) {
                return;
            }

            options.onSaved(toTemplateSummary(created));
        } catch (error: unknown) {
            if (generation !== submissionGeneration.value) {
                return;
            }

            if (isTemplateNameTakenError(error)) {
                setFieldError('name', t('bricks.templates.errors.nameTaken'));
                return;
            }

            if (isRequestTimeoutError(error)) {
                generalError.value = t('bricks.templates.errors.saveOutcomeUnknown');
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

    /**
     * Puts the caption proposed by the source into the form (on the opening of the
     * modal).
     *
     * Any submission in flight is declared somebody else's, and the flag of the
     * submission comes off together with it — otherwise a clean form would greet the
     * person with a disabled button.
     */
    function resetForm(): void {
        submissionGeneration.value += 1;

        resetVeeForm({
            values: {
                name: options.source.value?.suggestedName ?? '',
                description: options.source.value?.suggestedDescription ?? '',
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
