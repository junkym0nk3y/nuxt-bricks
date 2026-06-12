// #region Imports
// Types
import type { PropertyEditorType } from '../components/property-editors/types';
import type { IMediaItem } from '../../../../common/types/media';
import type { IInlineContentSegment, IGalleryItem } from '../../../../common/types/content';
import type {
    IDeviceVisibilityConfig,
    PropertyDefinition,
    TBricksDeviceKey,
} from '../../../../common/types/brick';
import type {
    TInlineGalleryPayload,
    TMediaContext,
    IUseSidebarPropertiesPanelOptions,
} from '../types/sidebarProperties';

// Vue
import { computed, defineAsyncComponent, ref, watch, type Component } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Composables
import { usePropertyVariants } from './usePropertyVariants';
import { useStoryImports } from '../../../../common/composables/useStoryImports';

// Utils
import {
    coerceNumberValue,
    coerceArrayValue,
    coerceObjectValue,
} from '../utils/propertyValueCoercion';
import {
    cloneInlineSegments,
    createInlineMediaSegmentFromItem,
} from '../../../../layouts-blocks/utils/inlineContent';
import { normalizeDeviceVisibility } from '../../../../common/utils/bricks/deviceVisibility';
import { getBlockDefinition } from '../../../../layouts-blocks/registry';

// Constants
import { LAYOUT_COMPONENTS } from '../../../core/constants/layoutComponents';
// #endregion

/**
 * Инкапсулирует бизнес-логику панели свойств и предоставляет готовые обработчики для UI.
 *
 * @param options - Колбэки взаимодействия с внешними частями интерфейса.
 * @returns Набор сторов, вычисляемых данных и методов для панели свойств.
 */
export function useSidebarPropertiesPanel(options: IUseSidebarPropertiesPanelOptions) {
    // #region Data
    const store = useComponentsStore();
    const canvasStore = useCanvasStore();
    const currentMediaContext = ref<TMediaContext | null>(null);
    const storyDescription = ref<string>('');
    const { findImportModule } = useStoryImports();

    const componentEditors: Record<PropertyEditorType, Component> = {
        boolean: defineAsyncComponent(
            () => import('../../../../ui/base/checkbox/BricksCheckbox.vue')
        ),
        switch: defineAsyncComponent(() => import('../../../../ui/inputs/BricksSwitch.vue')),
        select: defineAsyncComponent(() => import('../../../../ui/inputs/BricksSelect.vue')),
        input: defineAsyncComponent(() => import('../../../../ui/inputs/BricksInput.vue')),
        textarea: defineAsyncComponent(() => import('../../../../text-editor/components/TextEditorArea.vue')),
        json: defineAsyncComponent(
            () => import('../components/property-editors/BuilderShellSidebarPropertyJsonEditor.vue')
        ),
        'inline-content': defineAsyncComponent(
            () => import('../components/property-editors/BuilderShellSidebarPropertyInlineContentEditor.vue')
        ),
        tags: defineAsyncComponent(() => import('../../../../ui/inputs/BricksTagsEditor.vue')),
        'image-gallery': defineAsyncComponent(
            () => import('../components/property-editors/BuilderShellSidebarPropertyImageGalleryEditor.vue')
        ),
        'accordion-items': defineAsyncComponent(
            () => import('../components/property-editors/BuilderShellSidebarPropertyAccordionItemsEditor.vue')
        ),
        color: defineAsyncComponent(() => import('../../../../ui/inputs/BricksHexInput.vue')),
        image: defineAsyncComponent(
            () => import('../components/property-editors/BuilderShellSidebarPropertyMediaPicker.vue')
        ),
        video: defineAsyncComponent(
            () => import('../components/property-editors/BuilderShellSidebarPropertyMediaPicker.vue')
        ),
    };
    // #endregion

    // #region Computed
    const isResponsiveLayout = computed<boolean>(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return false;
        }

        if (selected.component.type !== 'layout') {
            return false;
        }

        return getBlockDefinition(selected.component.componentName)?.responsiveMode === 'all';
    });

    /**
     * Есть ли у выбранного компонента story-свойства с responsive: true.
     */
    const hasResponsiveStoryValues = computed<boolean>(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return false;
        }
        return selected.properties.some((p) => p.responsive === true);
    });

    /**
     * Компонент поддерживает responsive: layout-компонент или обычный с responsive story values.
     */
    const isResponsiveComponent = computed<boolean>(() => {
        return isResponsiveLayout.value || hasResponsiveStoryValues.value;
    });

    const layoutDeviceScope = ref<TBricksDeviceKey>('desktop');

    const responsiveOverridesForScope = computed<Record<string, unknown> | null>(() => {
        const selected = store.selectedComponentData;
        if (!selected || !isResponsiveComponent.value) {
            return null;
        }

        const scope = layoutDeviceScope.value;
        if (scope === 'desktop') {
            return null;
        }

        const props = selected.component.props as Record<string, unknown>;
        const responsive = (props.responsive ?? {}) as Record<string, unknown>;
        const overrides = (responsive[scope] ?? null) as Record<string, unknown> | null;
        return overrides;
    });

    const hasResponsiveOverridesForScope = computed<boolean>(() => {
        const overrides = responsiveOverridesForScope.value;
        return overrides ? Object.keys(overrides).length > 0 : false;
    });

    const selectedComponentDataForVariants = computed(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return null;
        }

        if (!isResponsiveComponent.value) {
            return selected;
        }

        const scope = layoutDeviceScope.value;
        if (scope === 'desktop') {
            return selected;
        }

        const baseProps = selected.component.props as Record<string, unknown>;
        const responsive = (baseProps.responsive ?? {}) as Record<string, unknown>;
        const overrides = (responsive[scope] ?? {}) as Record<string, unknown>;

        const mergedProps = {
            ...baseProps,
            ...overrides,
        };

        delete (mergedProps as Record<string, unknown>).responsive;

        return {
            ...selected,
            component: {
                ...selected.component,
                props: mergedProps,
            },
        };
    });

    const { componentVariants, handleNormalizeProps } = usePropertyVariants(
        selectedComponentDataForVariants
    );

    const selectedComponentName = computed(
        () => store.selectedComponentData?.component?.componentName || ''
    );

    const selectedComponentDescription = computed(() => storyDescription.value);
    const orderedPropertyNames = computed<string[]>(() => {
        const selected = selectedComponentDataForVariants.value;
        if (!selected) {
            return [];
        }

        const visibleProperties = selected.properties.filter(
            (property) => property.type !== 'readonly'
        );
        const baseProperties = visibleProperties.filter(
            (property) => property.name !== 'action' && property.showWhen?.field !== 'action'
        );
        const actionProperties = visibleProperties.filter((property) => property.name === 'action');
        const actionDependentProperties = visibleProperties.filter(
            (property) => property.showWhen?.field === 'action'
        );

        return [
            ...baseProperties.map((property) => property.name),
            ...actionProperties.map((property) => property.name),
            ...actionDependentProperties.map((property) => property.name),
        ];
    });

    const hasSelectedComponentProps = computed(() =>
        Boolean(store.selectedComponentData?.properties.some((prop) => prop.type !== 'readonly'))
    );

    const showFullWidthControl = computed(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return false;
        }
        return !selected.component.parent;
    });

    const hasPropertiesSection = computed(
        () => hasSelectedComponentProps.value || showFullWidthControl.value
    );

    const fullWidthValue = computed(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return false;
        }
        return Boolean(selected.component.fullWidth);
    });

    const isHiddenValue = computed(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return false;
        }
        return Boolean(selected.component.isHidden);
    });

    const deviceVisibilityValue = computed<IDeviceVisibilityConfig>(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return normalizeDeviceVisibility(undefined);
        }

        return normalizeDeviceVisibility(selected.component.deviceVisibility);
    });

    const htmlIdValue = computed<string>(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return '';
        }
        return selected.component.htmlId ?? '';
    });
    // #endregion

    // #region Methods
    /**
     * Загружает описание компонента из story-файла (или из layout-конфига) для панели свойств.
     *
     * @param storyPath - Путь к story (layout/* или путь к *.brick.ts)
     */
    async function loadStoryDescription(storyPath: string): Promise<void> {
        if (storyPath.startsWith('layout/')) {
            storyDescription.value =
                LAYOUT_COMPONENTS.find((item) => item.storyPath === storyPath)?.description || '';
            return;
        }

        const moduleLoader = findImportModule(storyPath);
        if (!moduleLoader) {
            storyDescription.value = '';
            return;
        }

        try {
            const module = await moduleLoader();
            storyDescription.value = (module?.story?.description as string | undefined) || '';
        } catch (error) {
            console.error('[SidebarProperties] Failed to load story description:', error);
            storyDescription.value = '';
        }
    }

    watch(
        () => store.selectedComponentData?.component?.storyPath,
        async (storyPath) => {
            if (!storyPath) {
                storyDescription.value = '';
                return;
            }

            await loadStoryDescription(storyPath);
        },
        { immediate: true }
    );

    watch(
        () => store.selectedComponentData?.id,
        () => {
            layoutDeviceScope.value = canvasStore.isFigmaMode ? 'desktop' : canvasStore.viewport;
        }
    );

    /**
     * Синхронизирует scope sidebar с viewport канваса при переключении viewport.
     * В Figma mode сохраняет текущий выбранный scope.
     */
    watch(
        () => canvasStore.viewport,
        (newViewport) => {
            if (!canvasStore.isFigmaMode && isResponsiveComponent.value) {
                layoutDeviceScope.value = newViewport;
            }
        }
    );

    /**
     * Обрабатывает изменение значения свойства и приводит данные к нужному типу.
     *
     * @param property - Описание свойства.
     * @param value - Новое значение из UI.
     */
    function handleChangeValues(
        property: PropertyDefinition,
        value: string | boolean | number | Record<string, unknown> | Array<unknown>
    ): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        const previewProps =
            selectedComponentDataForVariants.value?.component.props ?? selected.component.props;
        const currentValue = (previewProps as Record<string, unknown>)[property.name];
        let finalValue: unknown = value;

        switch (property.type) {
            case 'number':
                finalValue = coerceNumberValue(value, currentValue);
                break;
            case 'array':
                finalValue = coerceArrayValue(property, value, currentValue);
                break;
            case 'object':
                finalValue = coerceObjectValue(property, value, currentValue);
                break;
            default:
                break;
        }

        if (finalValue === null || finalValue === undefined) {
            return;
        }

        const scope = layoutDeviceScope.value;
        const shouldUpdateResponsive =
            scope !== 'desktop' && (isResponsiveLayout.value || property.responsive === true);

        if (shouldUpdateResponsive) {
            store.updateComponentResponsiveProp(
                selected.id,
                scope,
                property.name,
                finalValue as string | number | boolean | Record<string, unknown> | Array<unknown>
            );
            return;
        }

        store.updateComponentProp(
            selected.id,
            property.name,
            finalValue as string | number | boolean | Record<string, unknown> | Array<unknown>
        );
    }

    /**
     * Включает или выключает отображение компонента во всю ширину страницы.
     *
     * @param value - Новое состояние переключателя.
     */
    function handleToggleFullWidth(value: boolean): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        store.setComponentFullWidth(selected.id, Boolean(value));
    }

    /**
     * Включает или выключает скрытие компонента.
     *
     * @param value - Новое состояние переключателя.
     */
    function handleToggleHidden(value: boolean): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        store.setComponentHidden(selected.id, Boolean(value));
    }

    /**
     * Переключает видимость компонента для выбранного устройства.
     *
     * @param device - Ключ устройства (mobile/tablet/desktop).
     * @param value - Новый флаг видимости.
     */
    function handleToggleDeviceVisibility(device: TBricksDeviceKey, value: boolean): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        store.setComponentDeviceVisibilityFlag(selected.id, device, Boolean(value));
    }

    /**
     * Открывает медиагалерею для произвольного свойства, inline-контента или image-gallery.
     *
     * @param property - Свойство, которое редактирует медиа.
     * @param inlinePayload - Дополнительные данные для inline/gallery редактора.
     */
    function handleOpenMediaGallery(
        property: PropertyDefinition,
        inlinePayload?: TInlineGalleryPayload
    ): void {
        if (property.type === 'inline-content' && inlinePayload) {
            currentMediaContext.value = {
                kind: 'inline-content',
                property,
                ...inlinePayload,
            };
        } else if (property.type === 'image-gallery' && inlinePayload) {
            currentMediaContext.value = {
                kind: 'image-gallery',
                property,
                ...inlinePayload,
            };
        } else {
            currentMediaContext.value = {
                kind: 'property',
                property,
            };
        }

        options.onOpenMediaGallery();
    }

    /**
     * Обрабатывает выбор медиафайла и обновляет соответствующее свойство компонента.
     *
     * @param item - Выбранный объект медиа.
     */
    function handleMediaSelect(item: IMediaItem): void {
        const context = currentMediaContext.value;
        const selected = store.selectedComponentData;

        if (!context || !selected) {
            return;
        }

        if (context.kind === 'property') {
            handleChangeValues(context.property, item.url);

            if (context.property.svgContentProperty) {
                store.updateComponentProp(
                    selected.id,
                    context.property.svgContentProperty,
                    item.svgContent || ''
                );
            }

            currentMediaContext.value = null;
            return;
        }

        if (context.kind === 'image-gallery') {
            handleImageGalleryMediaSelect(context, selected, item);
            return;
        }

        const property = context.property;
        const currentSegments = Array.isArray(selected.component.props[property.name])
            ? (selected.component.props[property.name] as IInlineContentSegment[])
            : [];
        const segments = cloneInlineSegments(currentSegments);

        if (context.action === 'replace' && typeof context.segmentIndex === 'number') {
            const targetIndex = context.segmentIndex;
            if (!segments[targetIndex]) {
                currentMediaContext.value = null;
                return;
            }

            const mediaSegment = createInlineMediaSegmentFromItem(item);
            segments[targetIndex] = {
                ...segments[targetIndex],
                ...mediaSegment,
            };
        } else {
            const insertionIndex =
                typeof context.insertIndex === 'number' ? context.insertIndex : segments.length;
            const mediaSegment = createInlineMediaSegmentFromItem(item);
            segments.splice(insertionIndex, 0, mediaSegment);
        }

        store.updateComponentProp(selected.id, property.name, segments);
        currentMediaContext.value = null;
    }

    /**
     * Обрабатывает выбор медиа для image-gallery редактора.
     *
     * @param context - Контекст медиа с данными о действии.
     * @param selected - Выбранный компонент.
     * @param item - Выбранный медиа-элемент.
     */
    function handleImageGalleryMediaSelect(
        context: TMediaContext & { kind: 'image-gallery' },
        selected: NonNullable<typeof store.selectedComponentData>,
        item: IMediaItem
    ): void {
        const property = context.property;
        const currentItems = Array.isArray(selected.component.props[property.name])
            ? (selected.component.props[property.name] as IGalleryItem[])
            : [];

        const items = currentItems.map((galleryItem) => ({ ...galleryItem }));

        const newGalleryItem: IGalleryItem = {
            id: `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            url: item.url,
            title: item.filename || '',
            alt: item.filename || '',
            svgContent: item.svgContent || undefined,
            mimeType: item.mimeType || undefined,
        };

        if (context.action === 'replace' && typeof context.itemIndex === 'number') {
            const targetIndex = context.itemIndex;
            if (items[targetIndex]) {
                items[targetIndex] = {
                    ...items[targetIndex],
                    url: item.url,
                    svgContent: item.svgContent || undefined,
                    mimeType: item.mimeType || undefined,
                };
            }
        } else {
            const insertionIndex =
                typeof context.insertIndex === 'number' ? context.insertIndex : items.length;
            items.splice(insertionIndex, 0, newGalleryItem);
        }

        store.updateComponentProp(selected.id, property.name, items);
        currentMediaContext.value = null;
    }

    /**
     * Устанавливает кастомный HTML id для якорной навигации.
     *
     * @param htmlId - Новое значение id (пустая строка — удаляет).
     */
    function handleSetHtmlId(htmlId: string): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }
        store.setComponentHtmlId(selected.id, htmlId);
    }

    /**
     * Устанавливает активную вкладку устройства для редактирования responsive overrides layout-компонентов.
     *
     * @param scope - Ключ устройства (desktop/tablet/mobile).
     */
    function handleSetLayoutDeviceScope(scope: TBricksDeviceKey): void {
        layoutDeviceScope.value = scope;
    }

    /**
     * Сбрасывает overrides для выбранного устройства (кроме desktop).
     */
    function handleResetLayoutDeviceScopeOverrides(): void {
        const selected = store.selectedComponentData;
        if (!selected || !isResponsiveComponent.value) {
            return;
        }

        const scope = layoutDeviceScope.value;
        if (scope === 'desktop') {
            return;
        }

        store.resetComponentResponsivePropsForDevice(selected.id, scope);
    }
    // #endregion

    return {
        store,
        componentEditors,
        componentVariants,
        handleNormalizeProps,
        selectedComponentName,
        selectedComponentDescription,
        orderedPropertyNames,
        hasPropertiesSection,
        showFullWidthControl,
        fullWidthValue,
        isHiddenValue,
        deviceVisibilityValue,
        isResponsiveLayout,
        isResponsiveComponent,
        layoutDeviceScope,
        hasResponsiveOverridesForScope,
        htmlIdValue,
        handleChangeValues,
        handleToggleFullWidth,
        handleToggleHidden,
        handleToggleDeviceVisibility,
        handleSetHtmlId,
        handleOpenMediaGallery,
        handleMediaSelect,
        handleSetLayoutDeviceScope,
        handleResetLayoutDeviceScopeOverrides,
    };
}
