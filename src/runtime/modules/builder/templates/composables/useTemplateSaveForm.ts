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
 * Форма «Сохранить как шаблон»: валидация общей схемой, создание через
 * `POST /api/bricks/templates`, разбор отказов по существу.
 *
 * Содержимое приходит источником (`options.source`), а не собирается здесь: у
 * точек входа оно разное — сохранённая схема страницы против текущего канваса, —
 * и форма к этому различию отношения не имеет.
 *
 * @param options - Источник содержимого и колбэк успеха.
 * @returns Поля формы, состояние отправки и операции.
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
     * Поколение отправки. Модалку закрывают и во время запроса (крестик, Esc), а
     * следующее открытие сбрасывает форму — значит прежний запрос может
     * завершиться, когда его формы уже нет, и его ошибка к чистой форме
     * отношения не имеет.
     */
    const submissionGeneration = ref(0);
    // #endregion

    // #region Methods
    /**
     * Валидирует форму и сохраняет шаблон.
     *
     * Занятое имя уходит под поле, а не в общий текст: это единственный отказ,
     * относящийся к конкретному полю. Проверить занятость заранее нельзя — список
     * в браузере копия, и имя мог занять другой редактор.
     *
     * Обрыв по потолку ожидания разбирается отдельно: сервер мог сохранить шаблон
     * и не успеть ответить, поэтому список перечитывается, а человеку сообщается
     * неопределённость — «не удалось» было бы неправдой, а повтор упёрся бы в
     * собственное имя как в занятое.
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

            // Список правится в любом случае: шаблон создан, и прятать его от
            // раздела только потому, что окно успели закрыть, было бы враньём
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
     * Ставит в форму подпись, предложенную источником (при открытии модалки).
     *
     * Прежняя отправка объявляется чужой: она может лететь до сих пор — окно
     * закрывают и во время запроса. Вместе с ней снимается признак отправки,
     * иначе чистая форма встречала бы человека выключенной кнопкой.
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
