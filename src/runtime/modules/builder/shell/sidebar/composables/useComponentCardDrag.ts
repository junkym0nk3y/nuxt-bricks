/**
 * Drag-and-drop карточки компонента: делегирует старт перетаскивания
 * drag-композаблу, инжектированному родителем сайдбара.
 */

// Types
import type { IDragComposable, ISidebarComponentCardProps } from '../components/types';

// Vue
import { inject } from 'vue';

interface IComponentCardDrag {
    handleDragStart: (event: DragEvent) => void;
}

/**
 * Обработчик dragstart карточки через инжектированный drag-композабл.
 */
export function useComponentCardDrag(props: ISidebarComponentCardProps): IComponentCardDrag {
    const dragComposable = inject<IDragComposable | undefined>('dragComposable');

    /**
     * Обрабатывает начало перетаскивания карточки компонента
     * @param event - DragEvent от браузера
     */
    function handleDragStart(event: DragEvent): void {
        console.log('[BuilderShellSidebarComponentCard] Drag start:', props.component.name);
        if (dragComposable) {
            dragComposable.startDrag(props.component, event);
        } else {
            console.error('[BuilderShellSidebarComponentCard] No drag composable found!');
        }
    }

    return { handleDragStart };
}
