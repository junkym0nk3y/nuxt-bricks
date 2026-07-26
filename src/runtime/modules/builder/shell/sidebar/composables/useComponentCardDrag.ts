/**
 * Drag-and-drop карточки компонента: делегирует старт перетаскивания
 * drag-композаблу, инжектированному родителем сайдбара.
 */

// Types
import type { IDragComposable, ISidebarComponentCardProps } from '../components/types';
import type { IDragVisualSize } from '../../../../common/types/brick';

// Vue
import { inject } from 'vue';

interface IComponentCardDrag {
    handleDragStart: (event: DragEvent) => void;
    handleDragEnd: () => void;
}

/**
 * Обработчик dragstart карточки через инжектированный drag-композабл.
 */
export function useComponentCardDrag(
    props: ISidebarComponentCardProps,
    getDragPreviewSize: () => IDragVisualSize
): IComponentCardDrag {
    const dragComposable = inject<IDragComposable | undefined>('dragComposable');

    /**
     * Обрабатывает начало перетаскивания карточки компонента
     * @param event - DragEvent от браузера
     */
    function handleDragStart(event: DragEvent): void {
        if (dragComposable) {
            dragComposable.startDrag(props.component, event, getDragPreviewSize());
        } else {
            console.error('[BuilderShellSidebarComponentCard] No drag composable found!');
        }
    }

    /**
     * Очищает transient drag-state; карточка-источник остаётся в списке.
     */
    function handleDragEnd(): void {
        dragComposable?.endDrag();
    }

    return { handleDragStart, handleDragEnd };
}
