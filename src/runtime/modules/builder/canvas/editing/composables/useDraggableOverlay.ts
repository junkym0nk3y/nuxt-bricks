// Types
import type { IDraggableOverlayOptions } from '../../types/composables';

// Vue
import { ref, computed, watch } from 'vue';

// VueUse
import { useElementBounding, useResizeObserver } from '@vueuse/core';

/** Gap between the overlay and the cursor, and between the overlay and the viewport edges */
const VIEWPORT_GAP = 42;

/**
 * A draggable fixed overlay bound to an anchor element: positioning clamped to the
 * viewport (useElementBounding follows the anchor while the page scrolls) and dragging
 * by the handle, which accumulates the offset.
 */
export function useDraggableOverlay(options: IDraggableOverlayOptions) {
    /** Overlay size — updated on a resize only, not while scrolling */
    const overlaySize = ref({ width: 400, height: 120 });

    useResizeObserver(options.overlayRef, (entries) => {
        const { width, height } = entries[0].contentRect;
        overlaySize.value = { width, height };
    });

    const { top: elTop, left: elLeft } = useElementBounding(options.anchorElement);

    /** Overlay offset the user set by dragging */
    const dragOffset = ref({ x: 0, y: 0 });

    /** Whether a drag is in progress */
    const isDragging = ref(false);

    /**
     * Resets the drag offset when the key (the edited component) changes.
     */
    watch(
        options.resetKey,
        () => {
            dragOffset.value = { x: 0, y: 0 };
        },
        { immediate: true }
    );

    /**
     * Fixed positioning styles of the overlay.
     * The left edge matches the cursor position at the moment of opening and the overlay
     * sits above the cursor; when it would leave the top edge, it goes below the cursor
     * instead.
     */
    const overlayStyle = computed(() => {
        const offset = options.cursorOffset();

        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

        const overlayH = overlaySize.value.height;
        const overlayW = overlaySize.value.width;

        const cursorY = elTop.value + (offset?.y ?? 0) + dragOffset.value.y;
        const rawLeft = elLeft.value + (offset?.x ?? 0) + dragOffset.value.x;
        const rawTop = cursorY - overlayH - VIEWPORT_GAP;

        const left = Math.max(VIEWPORT_GAP, Math.min(vw - overlayW - VIEWPORT_GAP, rawLeft));

        // An overlay leaving the top edge goes below the cursor
        let top = rawTop < VIEWPORT_GAP ? cursorY + VIEWPORT_GAP : rawTop;
        // Clamped top and bottom so the overlay always stays inside the viewport
        top = Math.max(VIEWPORT_GAP, Math.min(top, vh - overlayH - VIEWPORT_GAP));

        return {
            position: 'fixed' as const,
            top: `${top}px`,
            left: `${left}px`,
        };
    });

    /**
     * Starts dragging the overlay by its drag handle.
     */
    function onDragHandleMousedown(event: MouseEvent): void {
        event.preventDefault();

        isDragging.value = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        const startX = event.clientX - dragOffset.value.x;
        const startY = event.clientY - dragOffset.value.y;

        function handleMousemove(e: MouseEvent): void {
            dragOffset.value = {
                x: e.clientX - startX,
                y: e.clientY - startY,
            };
        }

        function handleMouseup(): void {
            isDragging.value = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMousemove);
            document.removeEventListener('mouseup', handleMouseup);
        }

        document.addEventListener('mousemove', handleMousemove);
        document.addEventListener('mouseup', handleMouseup);
    }

    return { isDragging, overlayStyle, onDragHandleMousedown };
}
