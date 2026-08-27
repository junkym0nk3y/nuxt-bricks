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
        if (scope === BASE_DEVICE_KEY) {
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
        selectedComponentDataForVariants,
        handleSetLayoutDeviceScope,
        handleResetLayoutDeviceScopeOverrides,
    };
}
