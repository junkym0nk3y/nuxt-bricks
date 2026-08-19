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
 * Форма правки подписи шаблона: то же имя и описание, что при сохранении, но
 * PATCH существующей записи.
 *
 * Отдельная форма, а не режим формы сохранения: у той есть источник содержимого,
 * карточка страницы и объяснение состава шаблона — здесь ничего этого нет, а
 * общий у них ровно один предмет (схема валидации), и он вынесен в утилиту.
 *
 * @param options - Правимый шаблон и колбэк успеха.
 * @returns Поля формы, состояние отправки и операции.
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
    /** Поколение отправки — см. форму сохранения: окно закрывают и во время запроса. */
    const submissionGeneration = ref(0);
    // #endregion

    // #region Methods
    /**
     * Валидирует форму и сохраняет подпись.
     *
     * Занятое имя — под поле; обрыв по потолку ожидания означает неизвестный исход
     * (сервер мог применить правку), поэтому список перечитывается, а не
     * объявляется отказ.
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

    /**
     * Ставит в форму текущую подпись шаблона (при открытии модалки).
     */
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
