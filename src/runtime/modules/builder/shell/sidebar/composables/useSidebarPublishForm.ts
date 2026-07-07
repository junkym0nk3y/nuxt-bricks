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
 * Форм-логика панели публикации сайдбара: значения формы из publish-стора,
 * validation schema, опции layout, превью URL и обработчики обновления полей.
 * Вызывать только из setup-контекста (регистрирует onMounted для дефолтов
 * backgroundColor/layout).
 */
export function useSidebarPublishForm(): IUseSidebarPublishFormReturn {
    const { t } = useI18n();
    const publishStore = usePublishStore();
    const bricksConfig = useBricksConfig();
    const isEditing = computed<boolean>(() => publishStore.editingPageId !== null);

    const { validationSchema } = usePublishValidationSchema(isEditing.value);

    const settings = computed(() => publishStore.currentFormState);
    const isSubmitting = computed(() => publishStore.isSubmitting);
    const defaultBackgroundColor = computed<string>(
        () => bricksConfig.backgroundColor || '#FFFFFF'
    );
    const defaultLayout = computed<string>(() => 'default');
    const initialValues = computed(() => ({
        pagename: settings.value.pagename || '',
        title: settings.value.title || '',
        description: settings.value.description || '',
    }));

    /**
     * Ключ формы должен меняться ТОЛЬКО при смене страницы (editingPageId),
     * НЕ при изменении полей формы. Иначе форма перерендерится и потеряет фокус.
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
     * Обновляет поле настроек публикации в сторе.
     * Валидация управляется vee-validate автоматически.
     *
     * @param field - имя поля настроек.
     * @param value - новое значение поля.
     */
    function handleUpdateField<K extends keyof TPublishFormState>(
        field: K,
        value: TPublishFormState[K]
    ): void {
        publishStore.setCurrentFormField(field, value);
        publishStore.clearValidationError(field);
    }

    /**
     * Обрабатывает выбранный элемент медиагалереи (social image).
     *
     * @param item - выбранный медиа-объект.
     */
    function handleMediaSelect(item: IMediaItem): void {
        handleUpdateField('socialImage', item.url);
    }

    /**
     * Сбрасывает выбранное social image.
     */
    function handleClearSocialImage(): void {
        handleUpdateField('socialImage', '');
    }

    /**
     * Обновляет выбранный layout страницы.
     *
     * @param value - выбранное значение layout.
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
