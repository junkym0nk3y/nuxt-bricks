// #region Imports
// Types
import type { IPublishPageFormValues, IPublishCreatePageFormOptions } from '../types/dashboard';

// Utils
import { buildDefaultFormState } from '../utils/formState';
import { slugifyPageTitle } from '../utils/slugify';
import { createPublishValidationSchema } from '../utils/validationSchema';
import { DEFAULT_LAYOUT } from '../../../common/utils/bricks/publishedPage';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBricksPageAddress } from '../../../common/composables/useBricksPageAddress';

// Vee-validate
import { useForm } from 'vee-validate';

// Pinia
import { usePublishStore } from '../stores/publish';
// #endregion

/**
 * The empty values of the creation form. `layout`/`backgroundColor` are not edited
 * by the modal but are needed by the shared validation schema.
 *
 * @returns The initial values of the form.
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
 * The form of the page creation modal: the pagename auto-slugified from the title
 * (until the slug is first edited by hand), the validation by the shared
 * `createPublishValidationSchema`, the creation through the `createPage` action of
 * the store (a POST carrying `published: false`).
 *
 * @param options - The source of the schema, the device set, the appearance (from
 * a template) and the callback of a successful creation (the move into the editor
 * is the caller's).
 */
export function usePublishCreatePageForm(options: IPublishCreatePageFormOptions) {
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
    /** The slug was edited by hand — the auto-slugify from the title is off */
    const isSlugEdited = ref(false);
    // #endregion

    // #region Computed
    const slugPreview = computed<string>(() => String(pagename.value ?? '').trim());
    // #endregion

    // #region Methods
    /**
     * Typing the pagename by hand: turns the auto-slugify off; clearing the field
     * entirely turns it back on.
     *
     * @param value - The slug that was typed.
     */
    function setPagename(value: string): void {
        isSlugEdited.value = value.trim() !== '';
        pagename.value = value;
    }

    /**
     * Validates the form and creates a draft page.
     *
     * The schema is handed over by the caller (`resolveSchema`): a blank canvas or
     * a parsed JSON file. A refusal from there stops the creation — that is a
     * cancellation rather than an error, so no message is shown.
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

            const address = toPageAddress(values.pagename, values.urlPrefix);
            const defaults = buildDefaultFormState();
            // The appearance of the template goes on top of the defaults, but only
            // with the fields that are filled in: a template may have had neither a
            // layout nor a background (the source page set none), and an empty value
            // is obliged to leave the default of the project rather than to write a
            // `null` onto the page
            const appearance = options.resolveAppearance?.() ?? null;

            await publishStore.createPage(schema, {
                ...defaults,
                layout: appearance?.layout || defaults.layout,
                backgroundColor: appearance?.backgroundColor || defaults.backgroundColor,
                pagename: address.pagename,
                title: values.title.trim(),
                description: values.description,
                keywords: values.keywords,
                urlPrefix: address.urlPrefix,
                subdomain: values.subdomain.trim() || null,
                viewportConfig: options.resolveViewportConfig?.() ?? null,
            });
            options.onCreated(address);
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
     * Resets the form to the empty values (on a second opening of the modal).
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
