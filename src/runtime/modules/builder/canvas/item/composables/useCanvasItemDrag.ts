// #region Imports
// Types
import type { ICanvasItemProps, IDragComposableCanvas } from '../../types/components';
import type { IComponentLibraryItem } from '../../../../common/types/brick';
import type { ComputedRef } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Utils
import { setSkeletonDragImage } from '../../../core/utils/dragVisuals';
import { measureDragSize } from '../../../../common/utils/dragAndDrop';
// #endregion

/**
 * Инкапсулирует логику drag-and-drop для элемента канваса:
 * создание лёгкого skeleton drag-image, установка dataTransfer и rollback transient-состояния.
 */
export function useCanvasItemDrag(
    props: ICanvasItemProps,
    isInlineEditing: ComputedRef<boolean>,
    dragComposable: IDragComposableCanvas | undefined
) {
    const canvasStore = useCanvasStore();

    // #region Methods
    /**
     * Обрабатывает начало перетаскивания элемента канваса.
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
                slots: Array.isArray(props.component.slots)
                    ? props.component.slots.map((slot) => ({
                          name: slot.name,
                          label: slot.label,
                          description: slot.description,
                          allowMultiple: slot.allowMultiple,
                      }))
                    : undefined,
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

        // Освобождаем место только после старта нативного drag, иначе синхронное
        // схлопывание источника отменит перетаскивание. Кадров два: в первом браузер
        // фиксирует стартовую max-height блока, во втором она уезжает в ноль —
        // без этого переход схлопывания не запускается (нет исходного значения).
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                canvasStore.vacateDragSource();
            });
        });
    }

    /**
     * Обрабатывает окончание перетаскивания для очистки состояния.
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
