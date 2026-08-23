// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IPublishPageFormValues, IPublishPageFormOptions } from '../types/dashboard';

// Utils
import { buildMetaPatchPayload } from '../utils/pagePayload';
import { createPublishValidationSchema } from '../utils/validationSchema';
import { DEFAULT_LAYOUT } from '../../../common/utils/bricks/publishedPage';

// Vue
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBricksPageAddress } from '../../../common/composables/useBricksPageAddress';

// Vee-validate
import { useForm } from 'vee-validate';

// Pinia
import { usePublishStore } from '../stores/publish';
// #endregion

/**
 * Builds the form values out of a page (the null fields become empty strings).
 * `layout`/`backgroundColor` are not edited by the panel but are needed by the
 * shared validation schema.
 *
 * @param page - A page, or null.
 * @returns The values of the meta form.
 */
function buildFormValues(page: TPublishedPageSummary | null): IPublishPageFormValues {
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
 * The local meta form of the selected page for the details panel of the dashboard.
 * Works on top of `patchPage` and does NOT touch the `currentFormState` of the
 * store — that one is bound to an editor session. The dirty detection and the
 * validation are vee-validate's (`useForm` plus the shared
 * `createPublishValidationSchema`).
 *
 * @param page - The reactive selected page.
 * @param options - Callbacks of the save result (the toasts are the caller's).
 */
export function usePublishPageForm(
    page: Ref<TPublishedPageSummary | null> | ComputedRef<TPublishedPageSummary | null>,
    options: IPublishPageFormOptions
) {
    // #region Data
    const publishStore = usePublishStore();
    const { t } = useI18n();
    const { isPageAddressFree, isEditorAddressFree } = useBricksPageAddress();

    const validationSchema = createPublishValidationSchema({
        t: (key) => t(key),
        isPageAddressFree,
        isEditorAddressFree,
        isAddressAvailable: (address, excludeId) =>
            publishStore.isAddressAvailable(address, excludeId),
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
     * Validates and saves the meta fields through a PATCH; on success resets the
     * dirty state onto the saved values. The PATCH goes out with a precondition
     * (the revision of the selected page): a conflict comes back as a readable
     * error, the store refreshes the list — and a repeated save overwrites somebody
     * else's changes.
     */
    const submitForm = handleSubmit(async (values) => {
        const target = page.value;
        if (!target || isSaving.value) {
            return;
        }

        isSaving.value = true;
        try {
            const updated = await publishStore.patchPage(target.id, {
                ...buildMetaPatchPayload(values),
                expectedRevision: target.revision,
            });
            resetForm({ values: buildFormValues(updated) });
            options.onSaveSuccess();
        } catch (error: unknown) {
            options.onSaveError(error instanceof Error ? error.message : '');
        } finally {
            isSaving.value = false;
        }
    });

    /**
     * Rolls the form back to the values of the selected page.
     */
    function resetToPage(): void {
        resetForm({ values: buildFormValues(page.value) });
    }

    /**
     * Sets the OG image (a pick from the media gallery).
     *
     * @param url - The URL of the image (an empty string resets it).
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
