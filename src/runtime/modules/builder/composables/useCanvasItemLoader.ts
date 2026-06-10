// #region Imports
// Types
import type { ILandingCanvasItemProps } from '../components/canvas/types';
import type { ILandExportModule, ILandValues } from '../../common/types/index';

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
import { useStoryImports } from '../../common/composables/useStoryImports';
// #endregion

const FORCE_RENDER_DEBOUNCE_MS = 500;

/**
 * Управляет асинхронной загрузкой Vue-компонента из story-модуля
 * и механизмом принудительного перерендера при изменении forceRender-пропов.
 */
export function useCanvasItemLoader(
    props: ILandingCanvasItemProps,
    isLayout: ComputedRef<boolean>
) {
    const { findImportModule } = useStoryImports();

    // #region Data
    const ComponentInstance = shallowRef<Component | null>(null);
    const forceRenderProps = shallowRef<string[]>([]);
    const forceRenderKey = ref<number>(0);
    let forceRenderTimer: ReturnType<typeof setTimeout> | null = null;
    // #endregion

    // #region Lifecycle
    if (!isLayout.value) {
        const importModule = findImportModule(props.component.storyPath);

        if (importModule) {
            ComponentInstance.value = defineAsyncComponent<Component>({
                loader: async () => {
                    const mod = await importModule();
                    const exported = (mod as ILandExportModule).default;

                    if (!exported) {
                        throw new Error(
                            `Component module ${props.component.storyPath} has no default export`
                        );
                    }

                    if (mod?.story?.values) {
                        const storyValues = mod.story.values as Record<string, ILandValues>;
                        const forceProps: string[] = [];

                        for (const [propName, propConfig] of Object.entries(storyValues)) {
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
    const forceRenderPropsSnapshot = computed<string>(() => {
        if (forceRenderProps.value.length === 0) {
            return '';
        }

        const componentProps = props.component.props || {};
        const values: Record<string, unknown> = {};

        for (const propName of forceRenderProps.value) {
            values[propName] = componentProps[propName];
        }

        return JSON.stringify(values);
    });
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
