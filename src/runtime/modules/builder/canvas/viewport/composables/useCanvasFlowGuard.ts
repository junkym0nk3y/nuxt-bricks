// #region Imports
// Vue
import { watch, type Ref } from 'vue';

// VueUse
import { useDebounceFn } from '@vueuse/core';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Utils
import { clearCanvasFlowInstant, markCanvasFlowInstant } from '../../../core/utils/canvasFlow';
// #endregion

// #region Data
/** Пауза после последнего изменения геометрии: колесо зума шлёт события пачкой. */
const FLOW_RELEASE_DELAY = 150;
// #endregion

/**
 * Глушит move-переходы потока, пока меняется геометрия канваса.
 *
 * Зум, смена viewport и пересчёт размеров двигают блоки на экране, не меняя их
 * порядок. `<TransitionGroup>` этого не различает и анимирует «переезд» каждого
 * блока — при зуме канвас заметно дрожит.
 *
 * @param canvasRef - Корневой элемент канваса.
 */
export function useCanvasFlowGuard(canvasRef: Ref<HTMLElement | null>): void {
    const canvasStore = useCanvasStore();

    const releaseFlowTransitions = useDebounceFn(() => {
        clearCanvasFlowInstant(canvasRef.value);
    }, FLOW_RELEASE_DELAY);

    /**
     * Помечает канвас на время изменения геометрии и снимает пометку после паузы.
     */
    function holdFlowTransitions(): void {
        markCanvasFlowInstant(canvasRef.value);
        releaseFlowTransitions();
    }

    // flush: 'pre' (дефолт) — класс встаёт до патча, Vue успевает увидеть его
    // при проверке transform-перехода.
    watch(
        [
            () => canvasStore.scale,
            () => canvasStore.width,
            () => canvasStore.height,
            () => canvasStore.viewport,
        ],
        holdFlowTransitions
    );
}
