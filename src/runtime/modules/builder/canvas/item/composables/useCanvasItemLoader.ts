// #region Imports
// Types
import type { ICanvasItemProps } from '../../types/components';
import type { IBrickExportModule } from '../../../../common/types/index';

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
import { useBrickMetadata } from '../../../core/composables/useBrickMetadata';

// Utils
import { buildForceRenderSnapshot } from '../utils/forceRenderSnapshot';
// #endregion

const FORCE_RENDER_DEBOUNCE_MS = 500;

/**
 * Drives the async loading of the Vue component out of a brick module, and the forced
 * re-render that follows a change of a forceRender prop.
 */
export function useCanvasItemLoader(props: ICanvasItemProps, isLayout: ComputedRef<boolean>) {
    const { findImportModule } = useBrickImports();
    const { readBrickMetadata } = useBrickMetadata();

    // #region Data
    const ComponentInstance = shallowRef<Component | null>(null);
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
     * Props whose edit requires the component to be created from scratch.
     * Taken from the manifest metadata rather than from the loaded module: until the
     * record arrives the list is empty, and there is nothing to recreate.
     */
    const forceRenderProps = computed<string[]>(() =>
        Object.entries(readBrickMetadata(props.component.brickPath)?.values ?? {})
            .filter(([, definition]) => definition.forceRender === true)
            .map(([propName]) => propName)
    );

    /**
     * Serialized values of the forceRender props, used to detect a change.
     */
    const forceRenderPropsSnapshot = computed<string>(() =>
        buildForceRenderSnapshot(forceRenderProps.value, props.component.props || {})
    );
    // #endregion

    watch(forceRenderPropsSnapshot, (newSnapshot, oldSnapshot) => {
        // An empty previous snapshot means "the list of forceRender props was not known
        // yet", not an edit by the user: the metadata arrives in a separate request, and
        // its arrival alone must not recreate the component
        if (!newSnapshot || !oldSnapshot || newSnapshot === oldSnapshot) {
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
