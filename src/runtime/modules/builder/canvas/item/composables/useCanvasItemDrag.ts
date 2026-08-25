// #region Imports
// Types
import type { ICanvasItemProps, IDragComposableCanvas } from '../../types/components';
import type { IComponentLibraryItem } from '../../../../common/types/brick';
import type { ComputedRef } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Utils
import { toSlotDeclarations } from '../../../core/utils/componentInsertPayload';
import { setSkeletonDragImage } from '../../../core/utils/dragVisuals';
import { measureDragSize } from '../../../../common/utils/dragAndDrop';
// #endregion

/**
 * Drag and drop of a canvas item: building the lightweight skeleton drag image, filling
 * dataTransfer and rolling the transient state back.
 */
export function useCanvasItemDrag(
    props: ICanvasItemProps,
    isInlineEditing: ComputedRef<boolean>,
    dragComposable: IDragComposableCanvas | undefined
) {
    const canvasStore = useCanvasStore();

    // #region Methods
    /**
     * Handles the start of a canvas item drag.
     */
    function handleDragStart(event: DragEvent): void {
        event.stopPropagation();

        if (isInlineEditing.value) {
            event.preventDefault();
            return;
        }

        if (dragComposable?.draggedComponent) {
            const snapshot: IComponentLibraryItem = {
                name: props.component.componentName,
                brickPath: props.component.brickPath,
                defaultProps: JSON.parse(JSON.stringify(props.component.props || {})),
                category: 'Existing',
                thumbnail: '',
                slots: toSlotDeclarations(props.component.slots),
            };
            dragComposable.draggedComponent.value = snapshot;
        }

        if (!event.dataTransfer) {
            return;
        }

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('component-id', props.component.id);
        event.dataTransfer.setData('text/plain', props.component.id);

        const target = event.currentTarget as HTMLElement | null;
        if (!target) {
            return;
        }

        const placeholderSize = measureDragSize(target);

        canvasStore.startCanvasDrag({
            source: 'canvas',
            componentId: props.component.id,
            ...placeholderSize,
        });

        setSkeletonDragImage({
            event,
            sourceElement: target,
            variant: 'canvas',
            placeholderSize,
        });

        // The spot is freed only after the native drag has started, otherwise collapsing
        // the source synchronously cancels the drag. Two frames are needed: in the first
        // the browser records the starting max-height of the block, in the second it
        // goes to zero — without that the collapse transition never starts, because
        // there is no value to start from.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                canvasStore.vacateDragSource();
            });
        });
    }

    /**
     * Handles the end of a drag and clears the state.
     */
    function handleDragEnd(event: DragEvent): void {
        event.stopPropagation();

        if (dragComposable?.draggedComponent) {
            dragComposable.draggedComponent.value = null;
        }
        canvasStore.finishCanvasDrag();
    }
    // #endregion

    return {
        handleDragStart,
        handleDragEnd,
    };
}
