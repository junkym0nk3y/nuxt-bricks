// #region Imports
// Types
import type { ICanvasItemProps, IDragComposableCanvas } from '../types/components';
import type { ComponentLibraryItem } from '../../../common/types/brick';
import type { ComputedRef } from 'vue';

// Pinia
import { useCanvasStore } from '../../stores/canvas';

// Utils
import { convertPxToRem } from '../../../common/utils/main';
// #endregion

/**
 * Инкапсулирует логику drag-and-drop для элемента канваса:
 * создание drag-image с клоном компонента, установка dataTransfer, очистка состояния.
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
            const snapshot: ComponentLibraryItem = {
                name: props.component.componentName,
                storyPath: props.component.storyPath,
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

        const target = event.target as HTMLElement;
        if (!target) {
            return;
        }

        const scale = canvasStore.scale;
        const rect = target.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        const clone = target.cloneNode(true) as HTMLElement;
        clone.style.position = 'absolute';
        clone.style.top = '-9999px';
        clone.style.left = '-9999px';
        clone.style.pointerEvents = 'none';
        clone.style.opacity = '0.8';
        clone.style.boxSizing = 'border-box';
        clone.style.overflow = 'hidden';
        clone.style.width = convertPxToRem(canvasStore.width);
        clone.setAttribute('data-bricks-viewport', canvasStore.viewport);

        const allChildren = clone.querySelectorAll('*');
        const wrapper = allChildren[0] as HTMLElement;

        if (wrapper) {
            wrapper.style.transform = `scale(${scale})`;
            wrapper.style.transformOrigin = 'top left';
            wrapper.style.position = 'relative';

            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, rgb(99 102 241 / 10%) 0%, rgb(99 102 241 / 20%) 100%);
                border: 2px dashed rgb(99 102 241 / 50%);
                border-radius: 0.4rem;
                pointer-events: none;
                z-index: 9999;
            `;
            wrapper.appendChild(overlay);

            const label = document.createElement('div');
            label.textContent = props.component.componentName;
            label.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 0.8rem 1.6rem;
                background: rgb(99 102 241 / 90%);
                border-radius: 0.4rem;
                font-size: 1.4rem;
                font-weight: 500;
                color: white;
                white-space: nowrap;
                z-index: 10000;
            `;
            wrapper.appendChild(label);
        }

        document.body.appendChild(clone);
        event.dataTransfer.setDragImage(clone, offsetX, offsetY);

        setTimeout(() => {
            document.body.removeChild(clone);
        }, 0);
    }

    /**
     * Обрабатывает окончание перетаскивания для очистки состояния.
     */
    function handleDragEnd(event: DragEvent): void {
        event.stopPropagation();

        if (dragComposable?.draggedComponent) {
            dragComposable.draggedComponent.value = null;
        }
    }
    // #endregion

    return {
        handleDragStart,
        handleDragEnd,
    };
}
