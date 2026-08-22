import { onBeforeUnmount, ref, type Ref } from 'vue';
import type { ICanvasPanState } from '../../types/canvas';

/**
 * Middle-button panning behavior for the canvas wrapper.
 *
 * @param containerRef - Scrollable container of the canvas.
 */
export function useCanvasPan(containerRef: Ref<HTMLElement | null>) {
    const isPanning = ref(false);
    const panState: ICanvasPanState = {
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
    };

    /**
     * Starts panning on a middle-button press.
     *
     * @param event - Pointer event from the container.
     */
    function handleCanvasAreaPointerDown(event: PointerEvent): void {
        if (event.button !== 1) {
            return;
        }

        const container = containerRef.value;
        if (!container) {
            return;
        }

        event.preventDefault();

        isPanning.value = true;
        panState.startX = event.clientX;
        panState.startY = event.clientY;
        panState.scrollLeft = container.scrollLeft;
        panState.scrollTop = container.scrollTop;

        addPanListeners();
    }

    /**
     * Updates the scroll position of the container while the pointer moves.
     *
     * @param event - PointerMove event.
     */
    function handleCanvasAreaPointerMove(event: PointerEvent): void {
        if (!isPanning.value) {
            return;
        }

        const container = containerRef.value;
        if (!container) {
            return;
        }

        const deltaX = event.clientX - panState.startX;
        const deltaY = event.clientY - panState.startY;

        container.scrollLeft = panState.scrollLeft - deltaX;
        container.scrollTop = panState.scrollTop - deltaY;
    }

    /**
     * Ends panning when the mouse button is released.
     */
    function handleCanvasAreaPointerUp(): void {
        if (!isPanning.value) {
            return;
        }

        isPanning.value = false;
        cleanupPanListeners();
    }

    /**
     * Attaches the global pointer listeners used for panning.
     */
    function addPanListeners(): void {
        window.addEventListener('pointermove', handleCanvasAreaPointerMove);
        window.addEventListener('pointerup', handleCanvasAreaPointerUp);
        window.addEventListener('pointercancel', handleCanvasAreaPointerUp);
    }

    /**
     * Removes the global pointer listeners.
     */
    function cleanupPanListeners(): void {
        window.removeEventListener('pointermove', handleCanvasAreaPointerMove);
        window.removeEventListener('pointerup', handleCanvasAreaPointerUp);
        window.removeEventListener('pointercancel', handleCanvasAreaPointerUp);
    }

    /**
     * Drops the global listeners on unmount.
     */
    onBeforeUnmount(() => {
        cleanupPanListeners();
    });

    return {
        isPanning,
        handleCanvasAreaPointerDown,
    };
}
