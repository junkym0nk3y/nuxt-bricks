// Types
import type { TBricksDeviceKey } from '../../../../common/types/brick';

// Vue
import { computed, ref, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Utils
import { getBlockDefinition } from '../../../../layouts-blocks/registry';

/**
 * Responsive-scope панели свойств: определение адаптивности выбранного
 * компонента, активная вкладка устройства, merge overrides в props
 * для предпросмотра значений и синхронизация scope с viewport канваса.
 */
export function useSidebarResponsiveScope() {
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

    /**
     * При выборе другого компонента scope следует за viewport канваса
     * (в Figma mode — desktop).
     */
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

    return {
        isResponsiveLayout,
        hasResponsiveStoryValues,
        isResponsiveComponent,
        layoutDeviceScope,
        hasResponsiveOverridesForScope,
        selectedComponentDataForVariants,
        handleSetLayoutDeviceScope,
        handleResetLayoutDeviceScopeOverrides,
    };
}
