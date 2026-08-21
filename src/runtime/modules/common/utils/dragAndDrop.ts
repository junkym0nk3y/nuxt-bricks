// #region Imports
// Types
import type { IDragVisualSize } from '../types/brick';
// #endregion

// #region Data
/**
 * The share of the parent width at which a block counts as full-width: the
 * placeholder of such a block stretches to 100% instead of fixed px.
 */
const FULL_WIDTH_RATIO = 0.95;

const PLACEHOLDER_APPEAR_DURATION = 140;
const PLACEHOLDER_MOVE_DURATION = 160;
const PLACEHOLDER_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
// #endregion

// #region Methods
/**
 * Determines what exactly is being dragged: an existing canvas component, a library
 * card or a foreign payload (an OS file, a node of the schema tree).
 *
 * @param event - The current drag event.
 * @returns Traits of the payload; `isAccepted` — whether the drop may be accepted.
 */
function resolveDragPayload(event: DragEvent): {
    isExisting: boolean;
    isLibrary: boolean;
    isAccepted: boolean;
} {
    const types = Array.from(event.dataTransfer?.types || []);
    const isExisting = types.includes('component-id') || types.includes('text/plain');
    const isLibrary = types.includes('application/json');

    return { isExisting, isLibrary, isAccepted: isExisting || isLibrary };
}

/**
 * Sets the `dropEffect` according to the type of the payload. Without an explicit
 * effect the browser may reject the drop, and a foreign payload must not highlight
 * the zone.
 *
 * @param event - The current drag event.
 * @returns Whether the current zone accepts the payload.
 */
export function applyDropEffect(event: DragEvent): boolean {
    const { isExisting, isAccepted } = resolveDragPayload(event);

    if (!event.dataTransfer) {
        return isAccepted;
    }

    if (!isAccepted) {
        event.dataTransfer.dropEffect = 'none';
        return false;
    }

    event.dataTransfer.dropEffect = isExisting ? 'move' : 'copy';
    return true;
}

/**
 * Animates the insertion point, which lives outside the Vue flow (the layout zones
 * insert it into the DOM imperatively, so `<TransitionGroup>` does not see it).
 *
 * The first appearance is a soft fade-in; a change of position is a FLIP move from
 * the former coordinates. Through the Web Animations API rather than CSS: moving the
 * node inside the DOM would restart the CSS appearance animation, and the
 * placeholder would blink on every step.
 *
 * @param element - The placeholder element, already inserted at its new position.
 * @param previousRect - The former coordinates of the element, or null when it has just appeared.
 */
export function animateFlowPlaceholder(element: HTMLElement, previousRect: DOMRect | null): void {
    if (typeof element.animate !== 'function') {
        return;
    }

    if (!previousRect) {
        element.animate(
            [
                { opacity: 0, transform: 'scale(0.97)' },
                { opacity: 1, transform: 'none' },
            ],
            { duration: PLACEHOLDER_APPEAR_DURATION, easing: PLACEHOLDER_EASING }
        );
        return;
    }

    const nextRect = element.getBoundingClientRect();
    const shiftX = previousRect.left - nextRect.left;
    const shiftY = previousRect.top - nextRect.top;

    if (shiftX === 0 && shiftY === 0) {
        return;
    }

    element.animate([{ transform: `translate(${shiftX}px, ${shiftY}px)` }, { transform: 'none' }], {
        duration: PLACEHOLDER_MOVE_DURATION,
        easing: PLACEHOLDER_EASING,
    });
}

/**
 * Measures the actual size of a block for the drag visuals (the ghost and the
 * placeholder). The source of truth is the rendered DOM, with no hardcoded guesses
 * by block type.
 *
 * @param element - The element being measured.
 * @returns The size and whether the block is full-width.
 */
export function measureDragSize(element: HTMLElement | null): IDragVisualSize {
    if (!element) {
        return { width: 0, height: 0, isFullWidth: false };
    }

    const rect = element.getBoundingClientRect();
    const width = element.offsetWidth || element.scrollWidth || rect.width;
    const height = element.offsetHeight || element.scrollHeight || rect.height;
    const parentWidth = element.parentElement?.clientWidth ?? width;

    return {
        width,
        height,
        isFullWidth: parentWidth > 0 && width >= parentWidth * FULL_WIDTH_RATIO,
    };
}
// #endregion
