// #region Imports
// Types
import type {
    IDeviceVisibilityConfig,
    IPropertyDefinition,
    TBricksDeviceKey,
    TBrickPropValue,
} from '../../../../common/types/brick';
import type {
    IUseSidebarPropertiesPanelOptions,
    IUseSidebarPropertiesPanelReturn,
} from '../types/composables';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Composables
import { usePropertyVariants } from './usePropertyVariants';
import { useSidebarResponsiveScope } from './useSidebarResponsiveScope';
import { useSidebarMediaSelection } from './useSidebarMediaSelection';

// Constants
import { BASE_DEVICE_KEY } from '../../../../common/constants/devices';

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
 * @returns The computed data and the methods of the properties panel.
 */
export function useSidebarPropertiesPanel(
    options: IUseSidebarPropertiesPanelOptions
): IUseSidebarPropertiesPanelReturn {
    // #region Data
    const store = useComponentsStore();
    const { t, te } = useI18n();

    const {
        isResponsiveLayout,
        isResponsiveComponent,
        layoutDeviceScope,
        hasResponsiveOverridesForScope,
        hasLockedPropertiesForScope,
        selectedComponentDataForVariants,
        handleSetLayoutDeviceScope,
        handleResetLayoutDeviceScopeOverrides,
    } = useSidebarResponsiveScope();

    const { componentVariants } = usePropertyVariants(selectedComponentDataForVariants, {
        // A property no render adapts is shown on a device tab and refuses to move:
        // the write handler turns such a change away regardless, and a disabled field
        // is how the panel says so before the person tries
        isPropertyLocked: (property) =>
            layoutDeviceScope.value !== BASE_DEVICE_KEY && property.responsive !== true,
    });

    const { handleOpenMediaGallery, handleMediaSelect } = useSidebarMediaSelection({
        onOpenMediaGallery: options.onOpenMediaGallery,
        onWriteScopedValue: (property, value) => handleChangeValues(property, value),
        readScopedValue: (property) =>
            readOwnKey(
                (selectedComponentDataForVariants.value?.component.props ?? {}) as Record<
                    string,
                    unknown
                >,
                property.name
            ),
        isPropertyWritable: (property) =>
            layoutDeviceScope.value === BASE_DEVICE_KEY || property.responsive === true,
    });

    // #endregion

    // #region Computed
    // The panel keys its editors by this id, and it is read off `selectedComponent`
    // because that is the source the template read before the id moved in here.
    // `selectedComponentData` is not the same value: it answers null once the
    // selection leaves the component list, while the raw selection still names it.
    const selectedComponentId = computed<string>(() => store.selectedComponent?.id ?? '');

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

        if (scope !== BASE_DEVICE_KEY) {
            // A property nobody adapts is not written on a device tab at all — neither
            // into the overrides nor quietly into the base. The override would be a
            // value the published page has no way of honoring (a media query cannot
            // swap the content of a block or the address of a file), and the silent
            // write into the base would change every sheet at once while the person is
            // looking at one. The editor of such a property is disabled at this scope,
            // and this is the same rule stated where it cannot be bypassed
            if (property.responsive !== true) {
                return;
            }

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

    /**
     * Removes the selected component from the canvas.
     */
    function handleDeleteSelectedComponent(): void {
        const selected = store.selectedComponentData;
        if (!selected) {
            return;
        }

        store.removeComponent(selected.id);
    }
    // #endregion

    return {
        componentEditors,
        componentVariants,
        selectedComponentId,
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
        hasLockedPropertiesForScope,
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
        handleDeleteSelectedComponent,
    };
}
