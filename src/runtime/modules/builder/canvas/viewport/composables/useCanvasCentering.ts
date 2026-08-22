// Vue
import { watch, onBeforeUnmount, type Ref } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';
import { useSidebarStore } from '../../../core/stores/sidebar';

/**
 * Horizontal centering of the canvas: an rAF scheduler that gives smooth behavior
 * priority, plus watchers on the container appearing, on the scale or width of the
 * canvas and on the visibility and width of the sidebars.
 */
export function useCanvasCentering(canvasContainer: Ref<HTMLElement | null>) {
    const canvasStore = useCanvasStore();
    const sidebarStore = useSidebarStore();

    let centerAnimationFrame: number | null = null;
    let pendingCenterBehavior: ScrollBehavior = 'auto';

    /**
     * Centers the canvas horizontally within the available width.
     * Stays out of the way under a manual zoom (wheel or buttons) — there the scroll
     * position belongs to the user (zoom-to-cursor in useCanvasWheel).
     *
     * @param options - Scroll settings of the container.
     */
    function centerCanvasHorizontally(options: { behavior?: ScrollBehavior } = {}): void {
        if (typeof window === 'undefined' || canvasStore.hasManualZoom) {
            return;
        }

        const container = canvasContainer.value;

        if (!container) {
            return;
        }

        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        const behavior = options.behavior ?? 'auto';

        if (maxScrollLeft <= 0) {
            container.scrollLeft = 0;
            return;
        }

        const targetLeft = maxScrollLeft / 2;

        if (behavior === 'smooth' && typeof container.scrollTo === 'function') {
            container.scrollTo({
                left: targetLeft,
                behavior,
            });
            return;
        }

        container.scrollLeft = targetLeft;
    }

    /**
     * Schedules canvas centering for the next animation frame.
     *
     * @param behavior - Scroll behavior (`auto` or `smooth`).
     */
    function scheduleCanvasCenter(behavior: ScrollBehavior = 'auto'): void {
        if (behavior === 'smooth') {
            pendingCenterBehavior = 'smooth';
        } else if (pendingCenterBehavior !== 'smooth') {
            pendingCenterBehavior = behavior;
        }

        if (centerAnimationFrame !== null) {
            cancelAnimationFrame(centerAnimationFrame);
        }

        centerAnimationFrame = requestAnimationFrame(() => {
            centerAnimationFrame = null;
            centerCanvasHorizontally({ behavior: pendingCenterBehavior });
            pendingCenterBehavior = 'auto';
        });
    }

    /**
     * Centers the canvas horizontally as soon as canvasContainer appears.
     */
    watch(
        () => canvasContainer.value,
        (container) => {
            if (container) {
                scheduleCanvasCenter('auto');
            }
        }
    );

    /**
     * Recenters the canvas when its scale or width changes.
     */
    watch(
        () => [canvasStore.scale, canvasStore.width],
        () => {
            scheduleCanvasCenter('auto');
        }
    );

    /**
     * Watches the visibility and the width of the left sidebar and of the right
     * properties panel: opening or closing one recenters the canvas smoothly.
     */
    watch(
        () => [
            sidebarStore.left.visible,
            sidebarStore.left.width,
            sidebarStore.right.visible,
            sidebarStore.right.width,
        ],
        () => {
            scheduleCanvasCenter('smooth');
        }
    );

    onBeforeUnmount(() => {
        if (centerAnimationFrame !== null) {
            cancelAnimationFrame(centerAnimationFrame);
            centerAnimationFrame = null;
        }
    });

    return { scheduleCanvasCenter };
}
