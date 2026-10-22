// Types
import type { TBricksDeviceKey } from '../../../../common/types/brick';
import type { IUseSidebarResponsiveScopeReturn } from '../types/composables';

// Vue
import { computed, ref, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Constants
import { BASE_DEVICE_KEY } from '../../../../common/constants/devices';

// Utils
import { getBlockDefinition } from '../../../../layouts-blocks/registry';

/**
 * Responsive scope of the properties panel: whether the selected component is
 * responsive at all, which device tab is active, the merge of the overrides into the
 * props so the values can be previewed, and the sync of the scope with the canvas
 * viewport.
 */
export function useSidebarResponsiveScope(): IUseSidebarResponsiveScopeReturn {
    const store = useComponentsStore();
    const canvasStore = useCanvasStore();

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
     * Whether the selected component has brick properties with `responsive: true`.
     */
    const hasResponsiveBrickValues = computed<boolean>(() => {
        const selected = store.selectedComponentData;
        if (!selected) {
            return false;
        }
        return selected.properties.some((p) => p.responsive === true);
    });

    /**
     * The component supports responsive values: either it is a layout component, or an
     * ordinary one carrying responsive brick values.
     */
    const isResponsiveComponent = computed<boolean>(() => {
        return isResponsiveLayout.value || hasResponsiveBrickValues.value;
    });

    const layoutDeviceScope = ref<TBricksDeviceKey>(BASE_DEVICE_KEY);

    const responsiveOverridesForScope = computed<Record<string, unknown> | null>(() => {
        const selected = store.selectedComponentData;
        if (!selected || !isResponsiveComponent.value) {
            return null;
        }

        const scope = layoutDeviceScope.value;
        if (scope === BASE_DEVICE_KEY) {
            return null;
        }

        const props = selected.component.props as Record<string, unknown>;
        const responsive = (props.responsive ?? {}) as Record<string, unknown>;
        const overrides = (responsive[scope] ?? null) as Record<string, unknown> | null;
        return overrides;
    });

    /**
     * Whether the device has overrides the surface will actually honor.
     *
     * A stale override of a property nobody adapts does not count: the reset button
     * lights up for it, the person presses it and nothing they can see changes.
     */
    const hasResponsiveOverridesForScope = computed<boolean>(() => {
        const overrides = responsiveOverridesForScope.value;

        if (!overrides) {
            return false;
        }

        const properties = store.selectedComponentData?.properties ?? [];

        return Object.keys(overrides).some((name) => {
            const property = properties.find((item) => item.name === name);

            return property === undefined || property.responsive === true;
        });
    });

    /**
     * Whether the active scope holds properties that cannot be edited on it.
     *
     * Asked by the panel to explain the disabled fields in one line instead of leaving
     * a person guessing why a control refuses to move.
     */
    const hasLockedPropertiesForScope = computed<boolean>(() => {
        if (layoutDeviceScope.value === BASE_DEVICE_KEY) {
            return false;
        }

        const properties = store.selectedComponentData?.properties ?? [];

        // A property with no editor in the panel does not count: `readonly` shows a
        // value and takes no input, and `inline-content` is edited on the canvas by a
        // double click. Neither can look locked, so neither is worth explaining
        return properties.some(
            (property) =>
                property.type !== 'readonly' &&
                property.type !== 'inline-content' &&
                property.responsive !== true
        );
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
        if (scope === BASE_DEVICE_KEY) {
            return selected;
        }

        const baseProps = selected.component.props as Record<string, unknown>;
        const responsive = (baseProps.responsive ?? {}) as Record<string, unknown>;
        const overrides = (responsive[scope] ?? {}) as Record<string, unknown>;

        // Only what the block actually adapts is previewed. A schema saved while the
        // panel still wrote an override for ANY property keeps those overrides, and
        // showing one in the field would promise a per-device value the page never
        // had — the editor would be the only place in the product where it exists
        const adaptiveOverrides = Object.fromEntries(
            Object.entries(overrides).filter(([name]) => {
                const property = selected.properties.find((item) => item.name === name);

                return property === undefined || property.responsive === true;
            })
        );

        const mergedProps = {
            ...baseProps,
            ...adaptiveOverrides,
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

    /**
     * When another component is selected, the scope follows the canvas viewport — in
     * Figma mode, the base device.
     */
    watch(
        () => store.selectedComponentData?.id,
        () => {
            layoutDeviceScope.value = canvasStore.isFigmaMode
                ? BASE_DEVICE_KEY
                : canvasStore.viewport;
        }
    );

    /**
     * Syncs the sidebar scope with the canvas viewport whenever the viewport switches.
     * In Figma mode the currently picked scope is kept.
     *
     * The scope follows the viewport for a component without adaptive properties too.
     * The selection watcher above already sets it from the viewport for any component,
     * so a sync limited to responsive ones left such a component stuck on the device it
     * was selected under: back on the base device, the change handler kept refusing
     * every write as "locked on this device" and the edits were lost without a word.
     */
    watch(
        () => canvasStore.viewport,
        (newViewport) => {
            if (!canvasStore.isFigmaMode) {
                layoutDeviceScope.value = newViewport;
            }
        }
    );

    /**
     * Returns the scope to the base device when the active one leaves the set.
     *
     * The tab keeps a state of its own and survives an edit of the set: without the
     * reset a deleted `laptop` would stay picked, and the panel would go on writing
     * overrides into a key the page set no longer has.
     */
    watch(
        () => canvasStore.devices,
        (devices) => {
            if (devices.length > 0 && !devices.some((d) => d.key === layoutDeviceScope.value)) {
                layoutDeviceScope.value = BASE_DEVICE_KEY;
            }
        },
        { deep: true }
    );

    /**
     * Sets the active device tab the responsive overrides are edited under.
     *
     * @param scope - Device key, one of the keys of the page set.
     */
    function handleSetLayoutDeviceScope(scope: TBricksDeviceKey): void {
        layoutDeviceScope.value = scope;
    }

    /**
     * Drops the overrides of the picked device; the base device has none to drop.
     */
    function handleResetLayoutDeviceScopeOverrides(): void {
        const selected = store.selectedComponentData;
        if (!selected || !isResponsiveComponent.value) {
            return;
        }

        const scope = layoutDeviceScope.value;
        if (scope === BASE_DEVICE_KEY) {
            return;
        }

        store.resetComponentResponsivePropsForDevice(selected.id, scope);
    }

    return {
        isResponsiveLayout,
        hasResponsiveBrickValues,
        isResponsiveComponent,
        layoutDeviceScope,
        hasResponsiveOverridesForScope,
        hasLockedPropertiesForScope,
        selectedComponentDataForVariants,
        handleSetLayoutDeviceScope,
        handleResetLayoutDeviceScopeOverrides,
    };
}
