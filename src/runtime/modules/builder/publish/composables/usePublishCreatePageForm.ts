// #region Imports
// Types
import type { IPublishPageFormValues, IPublishCreatePageFormOptions } from '../types/dashboard';

// Utils
import { buildDefaultFormState } from '../utils/formState';
import { slugifyPageTitle } from '../utils/slugify';
import { createPublishValidationSchema } from '../utils/validationSchema';
import { DEFAULT_LAYOUT } from '../../../common/utils/bricks/publishedPage';

// Vue
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Vee-validate
import { useForm } from 'vee-validate';

// Pinia
import { usePublishStore } from '../stores/publish';
// #endregion

/**
 * Пустые значения формы создания. `layout`/`backgroundColor` не редактируются
 * модалкой, но нужны общей схеме валидации.
 *
 * @returns Начальные значения формы.
 */
function buildEmptyFormValues(): IPublishPageFormValues {
    return {
        pagename: '',
        title: '',
        description: '',
        keywords: '',
        socialImage: '',
        urlPrefix: '',
        subdomain: '',
        layout: DEFAULT_LAYOUT,
        backgroundColor: '',
    };
}

/**
 * Форма модалки создания страницы: авто-slugify pagename от названия
 * (до первого ручного редактирования slug), валидация общей схемой
 * `createPublishValidationSchema`, создание через `createPage` store'а
 * (POST с `published: false`).
 *
 * @param options - Источник схемы и колбэк успешного создания (переход в
 * редактор — на стороне вызывающего).
 */
export function usePublishCreatePageForm(options: IPublishCreatePageFormOptions) {
    // #region Data
    const publishStore = usePublishStore();
    const { t } = useI18n();

    const validationSchema = createPublishValidationSchema({
        t: (key) => t(key),
        isPagenameAvailable: (pagename, excludeId) =>
            publishStore.isPagenameAvailable(pagename, excludeId),
        getExcludeId: () => undefined,
    });

    const { defineField, handleSubmit, resetForm, errors } = useForm<IPublishPageFormValues>({
        validationSchema,
        initialValues: buildEmptyFormValues(),
    });

    const [title] = defineField('title');
    const [pagename] = defineField('pagename');
    const [description] = defineField('description');
    const [keywords] = defineField('keywords');
    const [urlPrefix] = defineField('urlPrefix');
    const [subdomain] = defineField('subdomain');

    const isSubmitting = ref(false);
    const generalError = ref('');
    /** Пользователь редактировал slug вручную — авто-slugify от названия отключён. */
    const isSlugEdited = ref(false);
    // #endregion

    // #region Computed
    const slugPreview = computed<string>(() => String(pagename.value ?? '').trim());
    // #endregion

    // #region Methods
    /**
     * Ручной ввод pagename: отключает авто-slugify; полная очистка поля включает его снова.
     *
     * @param value - Введённый slug.
     */
    function setPagename(value: string): void {
        isSlugEdited.value = value.trim() !== '';
        pagename.value = value;
    }

    /**
     * Валидирует форму и создаёт страницу-черновик.
     *
     * Схему отдаёт вызывающий (`resolveSchema`): пустой холст или разобранный
     * JSON-файл. Отказ оттуда прекращает создание — это отмена, а не ошибка,
     * поэтому сообщение не показывается.
     */
    const submitForm = handleSubmit(async (values) => {
        if (isSubmitting.value) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';
        try {
            const schema = await options.resolveSchema();

            if (!schema) {
                return;
            }

            await publishStore.createPage(schema, {
                ...buildDefaultFormState(),
                pagename: values.pagename.trim(),
                title: values.title.trim(),
                description: values.description,
                keywords: values.keywords,
                urlPrefix: values.urlPrefix.trim() || null,
                subdomain: values.subdomain.trim() || null,
            });
            options.onCreated(values.pagename.trim());
        } catch (error: unknown) {
            generalError.value =
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.createModal.createFailed');
        } finally {
            isSubmitting.value = false;
        }
    });

    /**
     * Сбрасывает форму к пустым значениям (при повторном открытии модалки).
     */
    function resetToEmpty(): void {
        resetForm({ values: buildEmptyFormValues() });
        isSlugEdited.value = false;
        generalError.value = '';
    }
    // #endregion

    // #region Lifecycle
    watch(title, (value) => {
        if (!isSlugEdited.value) {
            pagename.value = slugifyPageTitle(String(value ?? ''));
        }
    });
    // #endregion

    return {
        title,
        pagename,
        description,
        keywords,
        urlPrefix,
        subdomain,
        errors,
        slugPreview,
        isSubmitting,
        generalError,
        setPagename,
        submitForm,
        resetToEmpty,
    };
}
