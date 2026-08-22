/**
 * Drag and drop of a component card: the start of the drag is delegated to the drag
 * composable injected by the sidebar parent.
 */

// Types
import type { IDragComposable, ISidebarComponentCardProps } from '../components/types';
import type { IDragVisualSize } from '../../../../common/types/brick';
import type { IComponentCardDrag } from '../types/composables';

// Vue
import { inject } from 'vue';

/**
 * Handlers of a card drag, wired to the injected drag composable.
 */
export function useComponentCardDrag(
    props: ISidebarComponentCardProps,
    getDragPreviewSize: () => IDragVisualSize
): IComponentCardDrag {
    const dragComposable = inject<IDragComposable | undefined>('dragComposable');

    /**
     * Handles the start of a component card drag.
     *
     * @param event - DragEvent from the browser.
     */
    function handleDragStart(event: DragEvent): void {
        if (dragComposable) {
            dragComposable.startDrag(props.component, event, getDragPreviewSize());
        } else {
            console.error('[BuilderShellSidebarComponentCard] No drag composable found!');
        }
    }

    /**
     * Clears the transient drag state; the source card stays in the list.
     */
    function handleDragEnd(): void {
        dragComposable?.endDrag();
    }

    return { handleDragStart, handleDragEnd };
}
