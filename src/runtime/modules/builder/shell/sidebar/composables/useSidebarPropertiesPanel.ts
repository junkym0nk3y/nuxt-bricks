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
 * Facade of the properties panel: it assembles the responsive scope, the media
 * picking and the brick description, and hands the UI ready-made handlers.
 *
 * @param options - Callbacks into the parts of the interface that live outside.
 * @returns The stores, the computed data and the methods of the properties panel.
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
    });

    // #endregion

    // #region Computed
    const selectedComponentName = computed(
        () => store.selectedComponentData?.component?.componentName || ''
    );

    // The description arrives together with the selection and sits in the store —
    // the panel needs no second source, no loading of the same text from the brick
    // module. The `bricks.*` keys of the layout blocks are translated, the strings of
    // consumer brick files are shown as they are
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
     * Handles a change of a property value and coerces the data to the needed type.
     *
     * @param property - Description of the property.
     * @param value - New value coming from the UI.
     */
    function handleChangeValues(property: IPropertyDefinition, value: TBrickPropValue): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        const previewProps =
            selectedComponentDataForVariants.value?.component.props ?? selected.component.props;
        // The name of the property is declared by a brick file:
        // `previewProps['toString']` would return a prototype method, and the
        // coercion (number/array/object) would take the prop for one that already
        // holds a value
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
     * Turns the full-width display of the component on and off.
     *
     * @param value - New state of the toggle.
     */
    function handleToggleFullWidth(value: boolean): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        store.setComponentFullWidth(selected.id, Boolean(value));
    }

    /**
     * Turns the hiding of the component on and off.
     *
     * @param value - New state of the toggle.
     */
    function handleToggleHidden(value: boolean): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        store.setComponentHidden(selected.id, Boolean(value));
    }

    /**
     * Toggles the visibility of the component on the given device.
     *
     * @param device - Device key, one of the keys of the page set.
     * @param value - New visibility flag.
     */
    function handleToggleDeviceVisibility(device: TBricksDeviceKey, value: boolean): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        store.setComponentDeviceVisibilityFlag(selected.id, device, Boolean(value));
    }

    /**
     * Sets a custom HTML id for anchor navigation.
     *
     * @param htmlId - New id; an empty string removes it.
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
