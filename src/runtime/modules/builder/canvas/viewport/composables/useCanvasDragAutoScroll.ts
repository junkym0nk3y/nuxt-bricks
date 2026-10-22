// Vue
import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

/** Width of the container edge zone where a drag starts scrolling the canvas */
const EDGE_ZONE_PX = 110;

/** Top auto-scroll speed (px per frame), reached at the very edge of the container */
const MAX_SPEED_PX = 26;

/**
 * Auto-scroll of the canvas during a native drag and drop.
 *
 * A native HTML5 drag takes the input for itself: neither the wheel nor the trackpad
 * reaches `.canvasArea` (verified in Blink — no events arrive), so during a drag this
 * is the only way the canvas scrolls at all: while the cursor is held near the edge of
 * the container, the scroll is driven here, and the speed grows linearly from the
 * boundary of the zone toward the edge itself.
 *
 * Works both for a canvas drag and for library cards: the events are listened for on
 * the document, so the coordinates arrive no matter whose payload is being dragged.
 *
 * @param containerRef - Scrollable container of the canvas (.canvasArea).
 */
export function useCanvasDragAutoScroll(containerRef: Ref<HTMLElement | null>): void {
    const canvasStore = useCanvasStore();

    let frameId: number | null = null;
    let speedX = 0;
    let speedY = 0;

    /**
     * Computes the scroll speed for one axis.
     *
     * Zero when the cursor is outside the edge zones, or left the container by more
     * than the width of a zone (the payload is being dragged into a sidebar, and the
     * canvas must not scroll then).
     *
     * @param position - Cursor coordinate along the axis.
     * @param start - Start of the container along this axis (left/top).
     * @param end - End of the container along this axis (right/bottom).
     * @returns Scroll offset per frame: negative toward the start, positive toward the end.
     */
    function resolveAxisSpeed(position: number, start: number, end: number): number {
        const distanceToStart = position - start;
        const distanceToEnd = end - position;

        if (distanceToStart < -EDGE_ZONE_PX || distanceToEnd < -EDGE_ZONE_PX) {
            return 0;
        }

        if (distanceToStart < EDGE_ZONE_PX) {
            const ratio = Math.min(1, (EDGE_ZONE_PX - distanceToStart) / EDGE_ZONE_PX);
            return -MAX_SPEED_PX * ratio;
        }

        if (distanceToEnd < EDGE_ZONE_PX) {
            const ratio = Math.min(1, (EDGE_ZONE_PX - distanceToEnd) / EDGE_ZONE_PX);
            return MAX_SPEED_PX * ratio;
        }

        return 0;
    }

    /**
     * Stops the auto-scroll and zeroes the accumulated speed.
     */
    function stopAutoScroll(): void {
        if (frameId !== null) {
            cancelAnimationFrame(frameId);
            frameId = null;
        }
        speedX = 0;
        speedY = 0;
    }

    /**
     * One auto-scroll frame: moves the container at the current speed.
     *
     * The speed survives between frames because with a motionless cursor the browser
     * sends `dragover` only once every ~350 ms — otherwise the scroll would stutter.
     */
    function scrollFrame(): void {
        const container = containerRef.value;

        if (!container || (speedX === 0 && speedY === 0)) {
            stopAutoScroll();
            return;
        }

        container.scrollLeft += speedX;
        container.scrollTop += speedY;
        frameId = requestAnimationFrame(scrollFrame);
    }

    /**
     * Recomputes the speed from the cursor position and keeps the rAF loop alive.
     *
     * Both events are listened for: `dragover` (fired by the element under the cursor)
     * and `drag` (fired at the source no matter what is under the cursor) — over areas
     * where no `dragover` arrives, the coordinates come from `drag`.
     *
     * @param event - Drag or dragover event of the document.
     */
    function handleDragPointerMove(event: DragEvent): void {
        const container = containerRef.value;

        if (!container || canvasStore.dragState.source === null) {
            stopAutoScroll();
            return;
        }

        // Chrome sends the final `drag` events with zero coordinates — that is not
        // "the cursor is in the top left corner" but the absence of a position, so the
        // speed is left alone
        if (event.clientX === 0 && event.clientY === 0) {
            return;
        }

        const rect = container.getBoundingClientRect();
        speedX = resolveAxisSpeed(event.clientX, rect.left, rect.right);
        speedY = resolveAxisSpeed(event.clientY, rect.top, rect.bottom);

        if ((speedX !== 0 || speedY !== 0) && frameId === null) {
            frameId = requestAnimationFrame(scrollFrame);
        }
    }

    // Safety net for a drag session that ended without a dragend or drop over the document
    watch(
        () => canvasStore.dragState.source,
        (source) => {
            if (source === null) {
                stopAutoScroll();
            }
        }
    );

    // Capture is mandatory: slot and layout zones swallow `dragover` with
    // stopPropagation, and on the bubbling phase the auto-scroll would stall exactly
    // over them — that is, over most of the canvas.
    onMounted(() => {
        document.addEventListener('dragover', handleDragPointerMove, {
            capture: true,
            passive: true,
        });
        document.addEventListener('drag', handleDragPointerMove, {
            capture: true,
            passive: true,
        });
        document.addEventListener('dragend', stopAutoScroll, true);
        document.addEventListener('drop', stopAutoScroll, true);
    });

    onBeforeUnmount(() => {
        document.removeEventListener('dragover', handleDragPointerMove, true);
        document.removeEventListener('drag', handleDragPointerMove, true);
        document.removeEventListener('dragend', stopAutoScroll, true);
        document.removeEventListener('drop', stopAutoScroll, true);
        stopAutoScroll();
    });
}
