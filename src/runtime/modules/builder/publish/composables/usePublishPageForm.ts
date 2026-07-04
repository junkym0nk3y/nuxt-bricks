// #region Imports
// Types
import type { IPublishedPage } from '../../../common/types/bricks-api';
import type { IPublishPageFormValues, IPublishPageFormOptions } from '../types/dashboard';

// Utils
import { buildMetaPatchPayload } from '../utils/pagePayload';
import { createPublishValidationSchema } from '../utils/validationSchema';
import { DEFAULT_LAYOUT } from '../../../common/utils/bricks/publishedPage';

// Vue
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';

// Vee-validate
import { useForm } from 'vee-validate';

// Pinia
import { usePublishStore } from '../stores/publish';
// #endregion

/**
 * Собирает значения формы из страницы (null-поля приводятся к пустым строкам).
 * `layout`/`backgroundColor` панелью не редактируются, но нужны общей схеме валидации.
 *
 * @param page - Страница или null.
 * @returns Значения формы meta.
 */
function buildFormValues(page: IPublishedPage | null): IPublishPageFormValues {
    return {
        pagename: page?.pagename ?? '',
        title: page?.title ?? '',
        description: page?.description ?? '',
        keywords: page?.keywords ?? '',
        socialImage: page?.socialImage ?? '',
        urlPrefix: page?.urlPrefix ?? '',
        subdomain: page?.subdomain ?? '',
        layout: page?.layout || DEFAULT_LAYOUT,
        backgroundColor: page?.backgroundColor ?? '',
    };
}

/**
 * Локальная форма meta выбранной страницы для панели деталей дашборда.
 * Работает поверх `patchPage` и НЕ трогает `currentFormState` store'а —
 * тот привязан к сессии редактора. Dirty-детект и валидация — vee-validate
 * (`useForm` + общая схема `createPublishValidationSchema`).
 *
 * @param page - Реактивная выбранная страница.
 * @param options - Колбэки результата сохранения (тосты — на стороне вызывающего).
 */
export function usePublishPageForm(
    page: Ref<IPublishedPage | null> | ComputedRef<IPublishedPage | null>,
    options: IPublishPageFormOptions
) {
    // #region Data
    const publishStore = usePublishStore();
    const { t } = useI18n();

    const validationSchema = createPublishValidationSchema({
        t: (key) => t(key),
        isPagenameAvailable: (pagename, excludeId) =>
            publishStore.isPagenameAvailable(pagename, excludeId),
        getExcludeId: () => page.value?.id,
    });

    const { defineField, handleSubmit, resetForm, meta, errors } = useForm<IPublishPageFormValues>({
        validationSchema,
        initialValues: buildFormValues(page.value),
    });

    const [title] = defineField('title');
    const [pagename] = defineField('pagename');
    const [description] = defineField('description');
    const [keywords] = defineField('keywords');
    const [socialImage] = defineField('socialImage');
    const [urlPrefix] = defineField('urlPrefix');
    const [subdomain] = defineField('subdomain');

    const isSaving = ref(false);
    // #endregion

    // #region Computed
    const isDirty = computed<boolean>(() => meta.value.dirty);
    // #endregion

    // #region Methods
    /**
     * Валидирует и сохраняет meta-поля через PATCH; при успехе сбрасывает
     * dirty-состояние на сохранённые значения.
     */
    const submitForm = handleSubmit(async (values) => {
        const target = page.value;
        if (!target || isSaving.value) {
            return;
        }

        isSaving.value = true;
        try {
            const updated = await publishStore.patchPage(target.id, buildMetaPatchPayload(values));
            resetForm({ values: buildFormValues(updated) });
            options.onSaveSuccess();
        } catch (error: unknown) {
            options.onSaveError(error instanceof Error ? error.message : '');
        } finally {
            isSaving.value = false;
        }
    });

    /**
     * Откатывает форму к значениям выбранной страницы.
     */
    function resetToPage(): void {
        resetForm({ values: buildFormValues(page.value) });
    }

    /**
     * Устанавливает OG-изображение (выбор из медиа-галереи).
     *
     * @param url - URL изображения (пустая строка — сброс).
     */
    function setSocialImage(url: string): void {
        socialImage.value = url;
    }
    // #endregion

    // #region Lifecycle
    watch(
        () => page.value?.id,
        () => {
            resetToPage();
        }
    );
    // #endregion

    return {
        title,
        pagename,
        description,
        keywords,
        socialImage,
        urlPrefix,
        subdomain,
        errors,
        isDirty,
        isSaving,
        submitForm,
        resetToPage,
        setSocialImage,
    };
}
