// #region Imports
// Types
import type { ICanvasItemProps } from '../../types/components';
import type { IBrickExportModule, IBrickValues } from '../../../../common/types/index';

// Vue
import {
    shallowRef,
    ref,
    computed,
    watch,
    onBeforeUnmount,
    defineAsyncComponent,
    type Component,
    type ComputedRef,
} from 'vue';

// Composables
import { useBrickImports } from '../../../../common/composables/useBrickImports';

// Utils
import { buildForceRenderSnapshot } from '../utils/forceRenderSnapshot';
// #endregion

const FORCE_RENDER_DEBOUNCE_MS = 500;

/**
 * Управляет асинхронной загрузкой Vue-компонента из brick-модуля
 * и механизмом принудительного перерендера при изменении forceRender-пропов.
 */
export function useCanvasItemLoader(props: ICanvasItemProps, isLayout: ComputedRef<boolean>) {
    const { findImportModule } = useBrickImports();

    // #region Data
    const ComponentInstance = shallowRef<Component | null>(null);
    const forceRenderProps = shallowRef<string[]>([]);
    const forceRenderKey = ref<number>(0);
    let forceRenderTimer: ReturnType<typeof setTimeout> | null = null;
    // #endregion

    // #region Lifecycle
    if (!isLayout.value) {
        const importModule = findImportModule(props.component.brickPath);

        if (importModule) {
            ComponentInstance.value = defineAsyncComponent<Component>({
                loader: async () => {
                    const mod = await importModule();
                    const exported = (mod as IBrickExportModule).default;

                    if (!exported) {
                        throw new Error(
                            `Component module ${props.component.brickPath} has no default export`
                        );
                    }

                    if (mod?.brick?.values) {
                        const brickValues = mod.brick.values as Record<string, IBrickValues>;
                        const forceProps: string[] = [];

                        for (const [propName, propConfig] of Object.entries(brickValues)) {
                            if (propConfig.forceRender === true) {
                                forceProps.push(propName);
                            }
                        }

                        forceRenderProps.value = forceProps;
                    }

                    return exported as Component;
                },
                onError: (error) => {
                    console.error(
                        `Error loading component: ${props.component.componentName}`,
                        error
                    );
                },
            });
        }
    }

    // #region Computed
    /**
     * Сериализованные значения пропов с forceRender для отслеживания изменений.
     */
    const forceRenderPropsSnapshot = computed<string>(() =>
        buildForceRenderSnapshot(forceRenderProps.value, props.component.props || {})
    );
    // #endregion

    watch(forceRenderPropsSnapshot, (newSnapshot, oldSnapshot) => {
        if (!newSnapshot || newSnapshot === oldSnapshot) {
            return;
        }

        if (forceRenderTimer) {
            clearTimeout(forceRenderTimer);
        }

        forceRenderTimer = setTimeout(() => {
            forceRenderKey.value += 1;
            forceRenderTimer = null;
        }, FORCE_RENDER_DEBOUNCE_MS);
    });

    onBeforeUnmount(() => {
        if (forceRenderTimer) {
            clearTimeout(forceRenderTimer);
            forceRenderTimer = null;
        }
    });
    // #endregion

    return {
        ComponentInstance,
        forceRenderKey,
    };
}
