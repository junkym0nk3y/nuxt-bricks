// Vue
import { watch, onBeforeUnmount, nextTick, type Ref } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Constants
import { CANVAS_ZOOM_STEP } from '../../../core/constants/canvasScale';

/** Sensitivity of the multiplicative wheel zoom (px of deltaY to a factor) */
const WHEEL_ZOOM_INTENSITY = 0.002;

/** Pixels per line for deltaMode = DOM_DELTA_LINE (Firefox) */
const LINE_HEIGHT_PX = 16;

/** Delay before the CSS transition is restored after a burst of zoom events */
const TRANSITION_RESTORE_DELAY_MS = 300;

/**
 * Wheel interactions of the canvas: Ctrl(⌘)+scroll zooms to the cursor (a trackpad
 * pinch lands here too — the browser sends a wheel event with ctrlKey), Shift+scroll
 * scrolls horizontally for a mouse. The ± buttons run through the same formulas with
 * the anchor in the center of the visible area.
 *
 * @param containerRef - Scrollable container of the canvas (.canvasArea).
 */
export function useCanvasWheel(containerRef: Ref<HTMLElement | null>) {
    const canvasStore = useCanvasStore();

    let transitionRestoreTimeout: ReturnType<typeof setTimeout> | null = null;
    let suppressedTarget: HTMLElement | null = null;

    /**
     * Returns the scaled element inside the container
     * (.canvas in normal mode, .figmaWrapper in Figma mode).
     */
    function getZoomTarget(): HTMLElement | null {
        return containerRef.value?.querySelector<HTMLElement>('[data-canvas-zoom-target]') ?? null;
    }

    /**
     * Temporarily disables the transition on the scaled element: the transform has to
     * apply instantly, otherwise the scroll correction of zoom-to-cursor drifts away
     * from the animation. Restored once the zooming pauses.
     *
     * @param target - Element carrying the transform scale.
     */
    function suppressTransition(target: HTMLElement): void {
        target.style.transition = 'none';
        suppressedTarget = target;

        if (transitionRestoreTimeout !== null) {
            clearTimeout(transitionRestoreTimeout);
        }

        transitionRestoreTimeout = setTimeout(() => {
            restoreTransition();
        }, TRANSITION_RESTORE_DELAY_MS);
    }

    /**
     * Gives the element its CSS transition back (drops the inline suppression).
     */
    function restoreTransition(): void {
        if (suppressedTarget) {
            suppressedTarget.style.transition = '';
            suppressedTarget = null;
        }
        transitionRestoreTimeout = null;
    }

    /**
     * Changes the scale so that the canvas point under (clientX, clientY) stays put:
     * once the new transform is applied, scrollLeft/scrollTop are corrected by the
     * actual bounding rects measured before and after.
     *
     * @param targetScale - Desired scale (the store clamps it).
     * @param clientX - Screen X coordinate of the zoom anchor.
     * @param clientY - Screen Y coordinate of the zoom anchor.
     */
    async function zoomAtPoint(
        targetScale: number,
        clientX: number,
        clientY: number
    ): Promise<void> {
        const container = containerRef.value;
        const zoomTarget = getZoomTarget();

        if (!container || !zoomTarget) {
            canvasStore.setManualCanvasScale(targetScale);
            return;
        }

        const oldScale = canvasStore.scale;
        canvasStore.setManualCanvasScale(targetScale);
        const newScale = canvasStore.scale;

        if (newScale === oldScale) {
            return;
        }

        // Instant transform: the rects before and after have to be real, not mid-animation
        suppressTransition(zoomTarget);

        // The DOM still carries the old transform: the anchor position in the visual
        // coordinates of the canvas
        const rectBefore = zoomTarget.getBoundingClientRect();
        const pointX = clientX - rectBefore.left;
        const pointY = clientY - rectBefore.top;
        const ratio = newScale / oldScale;

        await nextTick();

        // The new transform is applied — put the anchor back under the cursor
        const rectAfter = zoomTarget.getBoundingClientRect();
        container.scrollLeft += rectAfter.left + pointX * ratio - clientX;
        container.scrollTop += rectAfter.top + pointY * ratio - clientY;
    }

    /**
     * Zoom anchored at the center of the visible canvas area (for the ± buttons).
     *
     * @param targetScale - Desired scale.
     */
    function zoomAtViewportCenter(targetScale: number): void {
        const container = containerRef.value;

        if (!container) {
            canvasStore.setManualCanvasScale(targetScale);
            return;
        }

        const rect = container.getBoundingClientRect();
        zoomAtPoint(targetScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    /**
     * Increases the scale by one button step (zoom to the center of the visible area).
     */
    function zoomInAtCenter(): void {
        zoomAtViewportCenter(canvasStore.scale + CANVAS_ZOOM_STEP);
    }

    /**
     * Decreases the scale by one button step (zoom to the center of the visible area).
     */
    function zoomOutAtCenter(): void {
        zoomAtViewportCenter(canvasStore.scale - CANVAS_ZOOM_STEP);
    }

    /**
     * Normalizes deltaY to pixels (Firefox sends deltaMode = DOM_DELTA_LINE).
     *
     * @param event - Wheel event.
     */
    function normalizeDeltaY(event: WheelEvent): number {
        return event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? event.deltaY * LINE_HEIGHT_PX
            : event.deltaY;
    }

    /**
     * Wheel handler: ctrl/⌘ zooms to the cursor, shift scrolls horizontally (for a
     * mouse only — a macOS trackpad sends deltaX natively).
     *
     * @param event - Wheel event of the container.
     */
    function handleWheel(event: WheelEvent): void {
        const container = containerRef.value;

        if (!container) {
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            // Suppress the browser page pinch-zoom, but only inside the canvas
            event.preventDefault();
            const factor = Math.exp(-normalizeDeltaY(event) * WHEEL_ZOOM_INTENSITY);
            zoomAtPoint(canvasStore.scale * factor, event.clientX, event.clientY);
            return;
        }

        if (event.shiftKey && event.deltaX === 0 && event.deltaY !== 0) {
            event.preventDefault();
            container.scrollLeft += normalizeDeltaY(event);
        }
    }

    // Non-passive listener: preventDefault for ctrl+wheel has to work
    watch(
        containerRef,
        (el, prev) => {
            prev?.removeEventListener('wheel', handleWheel);
            el?.addEventListener('wheel', handleWheel, { passive: false });
        },
        { immediate: true }
    );

    onBeforeUnmount(() => {
        containerRef.value?.removeEventListener('wheel', handleWheel);
        if (transitionRestoreTimeout !== null) {
            clearTimeout(transitionRestoreTimeout);
        }
        restoreTransition();
    });

    return {
        zoomInAtCenter,
        zoomOutAtCenter,
    };
}
