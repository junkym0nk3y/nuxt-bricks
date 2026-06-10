import { onBeforeUnmount, ref, type Ref } from 'vue';
import type { ILandingCanvasPanState } from '../types/canvas';

/**
 * Предоставляет поведение перетаскивания средней кнопкой мыши для обертки канваса.
 *
 * @param containerRef - Ссылка на скроллируемый контейнер канваса.
 */
export function useLandingCanvasPan(containerRef: Ref<HTMLElement | null>) {
    const isPanning = ref(false);
    const panState: ILandingCanvasPanState = {
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
    };

    /**
     * Запускает режим панорамирования при нажатии средней кнопки.
     *
     * @param event - Pointer-событие, пришедшее от контейнера.
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
     * Обновляет позицию скролла контейнера во время перемещения указателя.
     *
     * @param event - PointerMove-событие.
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
     * Завершает панорамирование при отпускании кнопки мыши.
     */
    function handleCanvasAreaPointerUp(): void {
        if (!isPanning.value) {
            return;
        }

        isPanning.value = false;
        cleanupPanListeners();
    }

    /**
     * Вешает глобальные обработчики pointer-событий для панорамирования.
     */
    function addPanListeners(): void {
        window.addEventListener('pointermove', handleCanvasAreaPointerMove);
        window.addEventListener('pointerup', handleCanvasAreaPointerUp);
        window.addEventListener('pointercancel', handleCanvasAreaPointerUp);
    }

    /**
     * Снимает глобальные обработчики pointer-событий.
     */
    function cleanupPanListeners(): void {
        window.removeEventListener('pointermove', handleCanvasAreaPointerMove);
        window.removeEventListener('pointerup', handleCanvasAreaPointerUp);
        window.removeEventListener('pointercancel', handleCanvasAreaPointerUp);
    }

    /**
     * Отключает глобальные обработчики во время размонтирования.
     */
    onBeforeUnmount(() => {
        cleanupPanListeners();
    });

    return {
        isPanning,
        handleCanvasAreaPointerDown,
    };
}
