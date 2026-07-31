// #region Imports
// Types
import type {
    IDeviceVisibilityConfig,
    IPropertyDefinition,
    TBricksDeviceKey,
    TBrickPropValue,
} from '../../../../common/types/brick';
import type { IUseSidebarPropertiesPanelOptions } from '../types/sidebarProperties';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Composables
import { usePropertyVariants } from './usePropertyVariants';
import { useSidebarResponsiveScope } from './useSidebarResponsiveScope';
import { useSidebarMediaSelection } from './useSidebarMediaSelection';

// Utils
import {
    coerceNumberValue,
    coerceArrayValue,
    coerceObjectValue,
} from '../utils/propertyValueCoercion';
import { componentEditors } from '../utils/propertyEditorComponents';
import { normalizeDeviceVisibility } from '../../../../common/utils/bricks/deviceVisibility';
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';
import { readOwnKey } from '../../../../common/utils/safeRecord';
// #endregion

/**
 * Фасад панели свойств: собирает responsive scope, выбор медиа, описание brick
 * и предоставляет готовые обработчики для UI. API сохранён — компоненты не трогаем.
 *
 * @param options - Колбэки взаимодействия с внешними частями интерфейса.
 * @returns Набор сторов, вычисляемых данных и методов для панели свойств.
 */
export function useSidebarPropertiesPanel(options: IUseSidebarPropertiesPanelOptions) {
    // #region Data
    const store = useComponentsStore();
    const { t, te } = useI18n();

    const {
        isResponsiveLayout,
        isResponsiveComponent,
        layoutDeviceScope,
        hasResponsiveOverridesForScope,
        selectedComponentDataForVariants,
        handleSetLayoutDeviceScope,
        handleResetLayoutDeviceScopeOverrides,
    } = useSidebarResponsiveScope();

    const { componentVariants, handleNormalizeProps } = usePropertyVariants(
        selectedComponentDataForVariants
    );

    const { handleOpenMediaGallery, handleMediaSelect } = useSidebarMediaSelection({
        onOpenMediaGallery: options.onOpenMediaGallery,
        applyPropertyValue: handleChangeValues,
    });

    // #endregion

    // #region Computed
    const selectedComponentName = computed(
        () => store.selectedComponentData?.component?.componentName || ''
    );

    // Описание приезжает вместе с выбором компонента и лежит в сторе — второго
    // источника (загрузки его же из brick-модуля) панели не нужно. Ключи
    // `bricks.*` у layout-блоков переводятся, строки brick-файлов потребителя
    // показываются как есть
    const selectedComponentDescription = computed<string>(
        () => resolveBricksLabel(t, te, store.selectedComponentData?.description ?? '') || ''
    );

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
     * Обрабатывает изменение значения свойства и приводит данные к нужному типу.
     *
     * @param property - Описание свойства.
     * @param value - Новое значение из UI.
     */
    function handleChangeValues(property: IPropertyDefinition, value: TBrickPropValue): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        const previewProps =
            selectedComponentDataForVariants.value?.component.props ?? selected.component.props;
        // Имя свойства объявляет brick-файл: `previewProps['toString']` вернул бы
        // метод прототипа, и приведение (number/array/object) считало бы, что у
        // пропа уже есть значение
        const currentValue = readOwnKey(previewProps as Record<string, unknown>, property.name);
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
                finalValue as TBrickPropValue
            );
            return;
        }

        store.updateComponentProp(selected.id, property.name, finalValue as TBrickPropValue);
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
