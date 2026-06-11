// #region Imports
// Types
import type { ICanvasItemProps } from '../components/types';
import type { IBrickValues } from '../../common/types/index';

// Vue
import { computed, provide, watch, type ComputedRef } from 'vue';

// VueUse
import { useEventListener } from '@vueuse/core';

// Pinia
import { useInlineEditingStore } from '../../editor/stores/inlineEditing';
import { useCanvasStore } from '../../builder/stores/canvas';

// Composables
import { useStoryImports } from '../../common/composables/useStoryImports';

// Utils
import { getLayoutProperties } from '../../builder/utils/layoutProperties';
import {
    findAllInlineEditableLayoutProps,
    findAllInlineEditableStoryProps,
    type IInlineEditableProp,
} from '../../builder/utils/inlineEditableProp';
// #endregion

/**
 * Управляет логикой inline-редактирования для элемента канваса:
 * определяет редактируемые пропы, запускает/останавливает редактирование,
 * обрабатывает Escape и смену viewport, пробрасывает контекст дочерним компонентам.
 */
export function useCanvasItemInlineEditing(
    props: ICanvasItemProps,
    isLayout: ComputedRef<boolean>,
    layoutName: ComputedRef<string>,
    availableFonts: string[]
) {
    const inlineEditingStore = useInlineEditingStore();
    const canvasStore = useCanvasStore();
    const { findImportModule } = useStoryImports();

    // #region Computed
    const isInlineEditing = computed<boolean>(() =>
        inlineEditingStore.isEditingComponent(props.component.id)
    );
    // #endregion

    // Provide inline-editing контекст для дочерних layout-компонентов (BlockTitle, BlockText)
    provide('inlineEditingContext', {
        componentId: computed(() => (isInlineEditing.value ? props.component.id : null)),
        propName: computed(() => (isInlineEditing.value ? inlineEditingStore.propName : null)),
        propType: computed(() => (isInlineEditing.value ? inlineEditingStore.propType : null)),
        isEditing: isInlineEditing,
    });

    // #region Methods
    /**
     * Находит все inline-editable свойства у компонента.
     * Для layout — из getLayoutProperties(), для story — из загруженного модуля.
     */
    async function findAllInlineEditableProps(): Promise<IInlineEditableProp[]> {
        if (isLayout.value) {
            return findAllInlineEditableLayoutProps(
                getLayoutProperties(layoutName.value, availableFonts)
            );
        }

        const moduleLoader = findImportModule(props.component.storyPath);
        if (!moduleLoader) {
            return [];
        }

        try {
            const module = await moduleLoader();
            if (!module?.story?.values) {
                return [];
            }

            const componentProps = (props.component.props as Record<string, unknown>) || {};

            return findAllInlineEditableStoryProps(
                module.story.values as Record<string, IBrickValues>,
                componentProps
            );
        } catch {
            return [];
        }
    }

    /**
     * Обрабатывает двойной клик для активации inline-editing.
     */
    async function handleDoubleClick(event: MouseEvent): Promise<void> {
        event.stopPropagation();

        if (isInlineEditing.value) {
            return;
        }

        // event.currentTarget обнуляется после await — захватываем синхронно до него
        const el = event.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        const cursorOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };

        const allProps = await findAllInlineEditableProps();
        if (allProps.length > 0) {
            const first = allProps[0];
            inlineEditingStore.startEditing(
                props.component.id,
                first.propName,
                first.propType,
                allProps,
                cursorOffset,
                el
            );
        }
    }
    // #endregion

    // #region Lifecycle
    // Escape → stop inline editing
    useEventListener(document, 'keydown', (event: KeyboardEvent) => {
        if (event.key === 'Escape' && isInlineEditing.value) {
            event.stopPropagation();
            inlineEditingStore.stopEditing();
        }
    });

    // Viewport switching → auto-stop editing
    watch(
        () => canvasStore.isViewportSwitching,
        (switching) => {
            if (switching && isInlineEditing.value) {
                inlineEditingStore.stopEditing();
            }
        }
    );
    // #endregion

    return {
        isInlineEditing,
        handleDoubleClick,
    };
}
