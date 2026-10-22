/**
 * The height policy of the canvas sheet, shared by the normal canvas and by a single
 * sheet of Figma mode. The measurement and the policy are separate on purpose: the two
 * surfaces write the result to different places (the store against a local ref) and
 * observe the container over different lifetimes.
 */

// Constants
import { CANVAS_HEIGHT_BUFFER } from '../constants/canvas';

/**
 * Measures the content height of the canvas root container.
 *
 * The inline `minHeight` is dropped for the read and restored right after: it is the
 * height already computed that holds the container open, so `scrollHeight` would
 * otherwise answer with that same height and the sheet could never shrink back.
 *
 * @param container - Root container of the canvas content.
 * @returns Content height in px.
 */
export function measureCanvasContentHeight(container: HTMLElement): number {
    const previousMinHeight = container.style.minHeight;

    try {
        container.style.minHeight = '';
        return container.scrollHeight;
    } finally {
        container.style.minHeight = previousMinHeight;
    }
}

/**
 * Resolves the height of the sheet out of the measured content.
 *
 * An empty canvas keeps the sheet height of its device untouched — the buffer there
 * would show an empty page as a page with a tail.
 *
 * @param baseHeight - Sheet height of the device.
 * @param contentHeight - Measured content height in px.
 * @param hasComponents - Whether the canvas holds any components.
 * @returns Height of the sheet in px.
 */
export function resolveContentDrivenCanvasHeight(
    baseHeight: number,
    contentHeight: number,
    hasComponents: boolean
): number {
    if (!hasComponents) {
        return baseHeight;
    }

    return Math.max(
        baseHeight + CANVAS_HEIGHT_BUFFER,
        Math.ceil(contentHeight + CANVAS_HEIGHT_BUFFER)
    );
}
