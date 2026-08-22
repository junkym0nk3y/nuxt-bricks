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
/** Pause after the last geometry change: a zoom wheel sends its events in bursts */
const FLOW_RELEASE_DELAY = 150;
// #endregion

/**
 * Silences the move transitions of the flow while the canvas geometry changes.
 *
 * A zoom, a viewport switch and a size recompute move the blocks on screen without
 * changing their order. `<TransitionGroup>` cannot tell the difference and animates
 * every block "traveling" — under a zoom the canvas visibly shivers.
 *
 * @param canvasRef - Root element of the canvas.
 */
export function useCanvasFlowGuard(canvasRef: Ref<HTMLElement | null>): void {
    const canvasStore = useCanvasStore();

    const releaseFlowTransitions = useDebounceFn(() => {
        clearCanvasFlowInstant(canvasRef.value);
    }, FLOW_RELEASE_DELAY);

    /**
     * Marks the canvas for the duration of a geometry change and clears the mark after
     * the pause.
     */
    function holdFlowTransitions(): void {
        markCanvasFlowInstant(canvasRef.value);
        releaseFlowTransitions();
    }

    // flush: 'pre' (the default) — the class lands before the patch, so Vue sees it
    // while checking for a transform transition.
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
