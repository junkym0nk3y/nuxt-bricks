// #region Imports
// Types
import type { ICanvasItemProps } from '../../types/components';

// Vue
import { computed, provide, watch, type ComputedRef } from 'vue';

// VueUse
import { useEventListener } from '@vueuse/core';

// Pinia
import { useInlineEditingStore } from '../../../../text-editor/stores/inlineEditing';
import { useCanvasStore } from '../../../core/stores/canvas';

// Composables
import { useBrickMetadata } from '../../../core/composables/useBrickMetadata';

// Utils
import { getLayoutProperties } from '../../../core/utils/layoutProperties';
import {
    findAllInlineEditableLayoutProps,
    findAllInlineEditableBrickProps,
    type IInlineEditableProp,
} from '../../../core/utils/inlineEditableProp';
// #endregion

/**
 * Управляет логикой inline-редактирования для элемента канваса:
 * определяет редактируемые пропы, запускает/останавливает редактирование,
 * обрабатывает Escape и смену viewport, пробрасывает контекст дочерним компонентам.
 */
export function useCanvasItemInlineEditing(
    props: ICanvasItemProps,
    isLayout: ComputedRef<boolean>,
    layoutName: ComputedRef<string>
) {
    const inlineEditingStore = useInlineEditingStore();
    const canvasStore = useCanvasStore();
    const { readBrickMetadata } = useBrickMetadata();

    // #region Computed
    const isInlineEditing = computed<boolean>(() =>
        inlineEditingStore.isEditingComponent(props.component.id)
    );
    // #endregion

    // Provide inline-editing контекст для дочерних layout-компонентов (BlockText)
    provide('inlineEditingContext', {
        componentId: computed(() => (isInlineEditing.value ? props.component.id : null)),
        propName: computed(() => (isInlineEditing.value ? inlineEditingStore.propName : null)),
        propType: computed(() => (isInlineEditing.value ? inlineEditingStore.propType : null)),
        isEditing: isInlineEditing,
    });

    // #region Methods
    /**
     * Находит все inline-editable свойства у компонента.
     * Для layout — из getLayoutProperties(), для brick — из метаданных манифеста.
     */
    function findAllInlineEditableProps(): IInlineEditableProp[] {
        if (isLayout.value) {
            return findAllInlineEditableLayoutProps(getLayoutProperties(layoutName.value));
        }

        const metadata = readBrickMetadata(props.component.brickPath);
        if (!metadata) {
            return [];
        }

        const componentProps = (props.component.props as Record<string, unknown>) || {};

        return findAllInlineEditableBrickProps(metadata.values, componentProps);
    }

    /**
     * Обрабатывает двойной клик для активации inline-editing.
     */
    function handleDoubleClick(event: MouseEvent): void {
        event.stopPropagation();

        if (isInlineEditing.value) {
            return;
        }

        const el = event.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        const cursorOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };

        const allProps = findAllInlineEditableProps();
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
