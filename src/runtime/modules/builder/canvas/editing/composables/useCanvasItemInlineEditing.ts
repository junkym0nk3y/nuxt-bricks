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
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Utils
import { getLayoutProperties } from '../../../core/utils/layoutProperties';
import {
    findAllInlineEditableLayoutProps,
    findAllInlineEditableBrickProps,
    type IInlineEditableProp,
} from '../../../core/utils/inlineEditableProp';
// #endregion

/**
 * Drives inline editing of a canvas item: finds the editable props, starts and stops
 * editing, handles Escape and a viewport switch, and passes the context down to child
 * components.
 */
export function useCanvasItemInlineEditing(
    props: ICanvasItemProps,
    isLayout: ComputedRef<boolean>,
    layoutName: ComputedRef<string>
) {
    const inlineEditingStore = useInlineEditingStore();
    const canvasStore = useCanvasStore();
    const { readBrickMetadata } = useBrickMetadata();
    const { canEdit } = useBuilderPermissions();

    // #region Computed
    const isInlineEditing = computed<boolean>(() =>
        inlineEditingStore.isEditingComponent(props.component.id)
    );
    // #endregion

    // Provide the inline editing context for child layout components (BlockText)
    provide('inlineEditingContext', {
        componentId: computed(() => (isInlineEditing.value ? props.component.id : null)),
        propName: computed(() => (isInlineEditing.value ? inlineEditingStore.propName : null)),
        propType: computed(() => (isInlineEditing.value ? inlineEditingStore.propType : null)),
        isEditing: isInlineEditing,
    });

    // #region Methods
    /**
     * Finds every inline-editable property of the component.
     * For a layout they come from getLayoutProperties(), for a brick from the manifest
     * metadata.
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
     * Handles the double click that starts inline editing.
     * A role without edit rights never enters the text editor.
     */
    function handleDoubleClick(event: MouseEvent): void {
        event.stopPropagation();

        if (isInlineEditing.value || !canEdit.value) {
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
