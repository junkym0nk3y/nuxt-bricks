// #region Data
/**
 * Canvas class that switches off the move transitions of the flow
 * (`bricks-canvas-flow-move`).
 *
 * `<TransitionGroup>` compares the screen coordinates of its children before and
 * after the patch, so it reacts not only to blocks being reordered but to any change
 * of canvas geometry — zoom, a viewport switch, a drop being applied. Such frames
 * have nothing to animate: the blocks did not travel, and the "settling" reads as
 * jitter.
 */
const CANVAS_FLOW_INSTANT_CLASS = 'bricks-canvas--flow-instant';
// #endregion

// #region Methods
/**
 * Marks the canvas as repainting without the flow animation.
 *
 * @param canvas - Root element of the canvas.
 */
export function markCanvasFlowInstant(canvas: HTMLElement | null): void {
    canvas?.classList.add(CANVAS_FLOW_INSTANT_CLASS);
}

/**
 * Gives the canvas its usual flow transitions back.
 *
 * @param canvas - Root element of the canvas.
 */
export function clearCanvasFlowInstant(canvas: HTMLElement | null): void {
    canvas?.classList.remove(CANVAS_FLOW_INSTANT_CLASS);
}

/**
 * Suppresses the flow transitions for the current repaint.
 *
 * Two frames, not one: Vue checks for a transform transition only after the DOM has
 * been patched, so the class has to outlive both the patch and the paint frame that
 * follows it.
 *
 * @param canvas - Root element of the canvas.
 */
export function suspendCanvasFlowTransitions(canvas: HTMLElement | null): void {
    if (!canvas) {
        return;
    }

    markCanvasFlowInstant(canvas);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            clearCanvasFlowInstant(canvas);
        });
    });
}
// #endregion
