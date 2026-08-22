// Types
import type { TPublishFormState } from '../../../../common/types/bricks-api';
import type { IMediaItem } from '../../../../common/types/media';
import type { TBrickDemoValues } from '../../../../common/types/index';
import type { IUseSidebarPublishFormReturn } from '../types/composables';

// Vue
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBricksConfig } from '../../../../common/composables/useBricksConfig';
import { usePublishValidationSchema } from './usePublishValidationSchema';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';

/**
 * Form logic of the sidebar publish panel: the form values from the publish store, the
 * validation schema, the layout options, the URL preview and the field update
 * handlers. Call it from a setup context only — it registers an `onMounted` that fills
 * in the defaults of `backgroundColor` and `layout`.
 */
export function useSidebarPublishForm(): IUseSidebarPublishFormReturn {
    const { t } = useI18n();
    const publishStore = usePublishStore();
    const bricksConfig = useBricksConfig();
    const isEditing = computed<boolean>(() => publishStore.editingPageId !== null);

    const { validationSchema } = usePublishValidationSchema();

    const settings = computed(() => publishStore.currentFormState);
    const isSubmitting = computed(() => publishStore.isSubmitting);
    const defaultBackgroundColor = computed<string>(
        () => bricksConfig.backgroundColor || '#FFFFFF'
    );
    const defaultLayout = computed<string>(() => 'default');
    // The routing fields are handed to the form too: without them yup would see an
    // empty urlPrefix, and the page address check — the urlPrefix and pagename pair —
    // would not work in the sidebar at all
    const initialValues = computed(() => ({
        pagename: settings.value.pagename || '',
        title: settings.value.title || '',
        description: settings.value.description || '',
        keywords: settings.value.keywords || '',
        urlPrefix: settings.value.urlPrefix || '',
        subdomain: settings.value.subdomain || '',
    }));

    /**
     * The key of the form has to change ONLY when the page changes (`editingPageId`),
     * never when a field does: otherwise the form re-renders and loses focus.
     */
    const formKey = computed(() => {
        const base = publishStore.editingPageId ?? 'new';
        return `form-${base}`;
    });

    const layoutOptions = computed(() => {
        const baseOptions = ['default', 'bricks'];
        const customLayouts = bricksConfig.layouts || [];
        const unique = Array.from(new Set([...baseOptions, ...customLayouts].filter(Boolean)));

        return unique.map((value) => ({
            label: String(value),
            value: String(value),
        }));
    });
    const layoutFacets = computed(() => layoutOptions.value.map((option) => option.value));

    const panelTitle = computed<string>(() =>
        isEditing.value ? t('bricks.publish.settingsTitleEdit') : t('bricks.publish.settingsTitle')
    );

    const fullUrlPreview = computed<string>(() => {
        const pagename = settings.value.pagename?.trim();
        if (!pagename) {
            return '';
        }
        const prefix = settings.value.urlPrefix?.trim();
        const subdomain = settings.value.subdomain?.trim();
        const path = prefix ? `/${prefix}/${pagename}` : `/${pagename}`;
        return subdomain ? `${subdomain}.[${t('bricks.publish.domainStub')}]${path}` : path;
    });

    /**
     * Updates a publish settings field in the store. Validation is driven by
     * vee-validate on its own.
     *
     * @param field - Name of the settings field.
     * @param value - New value of the field.
     */
    function handleUpdateField<K extends keyof TPublishFormState>(
        field: K,
        value: TPublishFormState[K]
    ): void {
        publishStore.setCurrentFormField(field, value);
        publishStore.clearValidationError(field);
    }

    /**
     * Handles the item picked in the media gallery for the social image.
     *
     * @param item - Picked media object.
     */
    function handleMediaSelect(item: IMediaItem): void {
        handleUpdateField('socialImage', item.url);
    }

    /**
     * Clears the picked social image.
     */
    function handleClearSocialImage(): void {
        handleUpdateField('socialImage', '');
    }

    /**
     * Updates the picked page layout.
     *
     * @param value - Picked layout value.
     */
    function handleLayoutChange(value: TBrickDemoValues): void {
        const nextLayout =
            typeof value === 'string' && value
                ? value
                : settings.value.layout || defaultLayout.value;
        handleUpdateField('layout', nextLayout);
    }

    onMounted(() => {
        if (!settings.value.backgroundColor) {
            handleUpdateField('backgroundColor', defaultBackgroundColor.value);
        }
        if (!settings.value.layout) {
            handleUpdateField('layout', defaultLayout.value);
        }
    });

    return {
        settings,
        isSubmitting,
        defaultBackgroundColor,
        defaultLayout,
        initialValues,
        formKey,
        layoutOptions,
        layoutFacets,
        panelTitle,
        fullUrlPreview,
        validationSchema,
        handleUpdateField,
        handleMediaSelect,
        handleClearSocialImage,
        handleLayoutChange,
    };
}
