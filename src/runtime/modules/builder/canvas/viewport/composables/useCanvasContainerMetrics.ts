// Types
import type { ICanvasContainerMetricsOptions } from '../../types/composables';

// Vue
import { watch, nextTick, onBeforeUnmount } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';
import { useComponentsStore } from '../../../core/stores/components';

/**
 * Keeps the canvas height in sync with its content: recomputes the container metrics
 * when the set of components, the viewport or Figma mode changes, and reattaches its
 * ResizeObserver when containerRef is replaced.
 */
export function useCanvasContainerMetrics(options: ICanvasContainerMetricsOptions) {
    const canvasStore = useCanvasStore();
    const componentsStore = useComponentsStore();
    const { containerRef, scheduleCanvasCenter, scrollToSelected } = options;

    let containerResizeObserver: ResizeObserver | null = null;

    /**
     * Updates the canvas height from the content of the root container.
     */
    function updateContainerMetrics(): void {
        const container = containerRef.value;
        if (!container) {
            return;
        }

        const previousMinHeight = container.style.minHeight;
        container.style.minHeight = '';
        const contentHeight = container.scrollHeight;
        container.style.minHeight = previousMinHeight;
        canvasStore.syncCanvasHeightWithContent(contentHeight, componentsStore.hasComponents);
    }

    /**
     * Creates the ResizeObserver of the container (called from onMounted of the
     * component, once containerRef is rendered).
     */
    function initMetricsObserver(): void {
        containerResizeObserver = new ResizeObserver(() => {
            updateContainerMetrics();
            scheduleCanvasCenter('auto');
        });
        if (containerRef.value) {
            containerResizeObserver.observe(containerRef.value);
        }
    }

    /**
     * Recomputes the canvas height when the set of components changes.
     *
     * Two sources cover every case:
     * - `components` (the reference) catches a full replacement of the array
     *   (loadSchema, undo/redo)
     * - `components.length` catches mutations (push in addComponent, splice in
     *   moveComponentToRoot)
     *
     * The ResizeObserver stays silent when the content shrinks (minHeight keeps the
     * container from collapsing), so add/remove/import need an explicit recompute.
     */
    watch([() => componentsStore.components, () => componentsStore.components.length], () => {
        nextTick(() => {
            updateContainerMetrics();
        });
    });

    /**
     * Recomputes the canvas height after a viewport switch.
     *
     * A sheet of another width rebuilds the content: components change height because
     * of the different width, grid columns reflow, container queries switch over.
     * setViewport resets the height to the base one, and the right one is picked up
     * here, after the render.
     */
    watch(
        () => canvasStore.viewport,
        () => {
            nextTick(() => {
                updateContainerMetrics();
                scrollToSelected();
            });
        }
    );

    /**
     * Reattaches the ResizeObserver when containerRef changes.
     *
     * Switching between Figma and normal mode makes v-if destroy the old DOM element
     * and create a new one. The ResizeObserver stays on the old (destroyed) element,
     * so updateContainerMetrics() stops being called on its own.
     */
    watch(containerRef, (newContainer, oldContainer) => {
        if (containerResizeObserver) {
            if (oldContainer) {
                containerResizeObserver.unobserve(oldContainer);
            }
            if (newContainer) {
                containerResizeObserver.observe(newContainer);
            }
        }
    });

    /**
     * Watches the Figma mode toggle: waits for the DOM update (v-if renders or removes
     * figmaWrapper), then recomputes the canvas height and centers it.
     */
    watch(
        () => canvasStore.isFigmaMode,
        (isFigma) => {
            nextTick(() => {
                updateContainerMetrics();
                scheduleCanvasCenter('auto');

                // Leaving Figma mode scrolls to the selected component
                if (!isFigma) {
                    scrollToSelected();
                }
            });
        }
    );

    onBeforeUnmount(() => {
        if (containerResizeObserver && containerRef.value) {
            containerResizeObserver.unobserve(containerRef.value);
        }
        containerResizeObserver?.disconnect();
        containerResizeObserver = null;
    });

    return { updateContainerMetrics, initMetricsObserver };
}
