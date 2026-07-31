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
 * Управляет асинхронной загрузкой Vue-компонента из brick-модуля
 * и механизмом принудительного перерендера при изменении forceRender-пропов.
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
     * Пропы, правка которых требует полного пересоздания компонента.
     * Берутся из метаданных манифеста, а не из загруженного модуля: до
     * появления записи список пуст, и пересоздавать нечего.
     */
    const forceRenderProps = computed<string[]>(() =>
        Object.entries(readBrickMetadata(props.component.brickPath)?.values ?? {})
            .filter(([, definition]) => definition.forceRender === true)
            .map(([propName]) => propName)
    );

    /**
     * Сериализованные значения пропов с forceRender для отслеживания изменений.
     */
    const forceRenderPropsSnapshot = computed<string>(() =>
        buildForceRenderSnapshot(forceRenderProps.value, props.component.props || {})
    );
    // #endregion

    watch(forceRenderPropsSnapshot, (newSnapshot, oldSnapshot) => {
        // Пустой прежний снимок — это «список forceRender-пропов ещё не был
        // известен», а не правка пользователя: метаданные приезжают отдельным
        // запросом, и их появление само по себе пересоздавать компонент не должно
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
