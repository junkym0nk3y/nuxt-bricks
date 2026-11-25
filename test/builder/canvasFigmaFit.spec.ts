/**
 * @vitest-environment happy-dom
 *
 * The fit scale of Figma mode has to leave the row with its side padding inside the
 * client width of the canvas area. The padding stands beside the row, so the fit has no
 * slack of its own: a scrollbar gutter left out of it, or a float error rounded up to a
 * whole pixel, brought a horizontal scroll at the very scale meant to show everything.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { effectScope, type EffectScope } from 'vue';

// Types
import type { TBricksResolvedDeviceSet } from '../../src/runtime/modules/common/types/devices';

// Composables and stores of the builder
import { useCanvas } from '../../src/runtime/modules/builder/canvas/viewport/composables/useCanvas';
import { useCanvasStore } from '../../src/runtime/modules/builder/core/stores/canvas';
// #endregion

/** Width of the vertical navigation rail, as the canvas container subtracts it */
const NAV_WIDTH_PX = 72;

/** A thin classic scrollbar, the gutter `scrollbar-gutter: stable` holds */
const SCROLLBAR_GUTTER_PX = 11;

/** Observer that does nothing: happy-dom lays nothing out */
class FakeResizeObserver {
    observe = vi.fn();

    disconnect = vi.fn();
}

/**
 * Builds the canvas area as the browser would measure it: the width it is given, and a
 * client width short of the gutter.
 *
 * @param width - The width of the area.
 * @returns The area element.
 */
function buildCanvasArea(width: number): HTMLElement {
    const area = document.createElement('div');
    Object.defineProperty(area, 'offsetWidth', { value: width });
    Object.defineProperty(area, 'clientWidth', { value: width - SCROLLBAR_GUTTER_PX });

    return area;
}

describe('fit scale of Figma mode', () => {
    let scope: EffectScope;

    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        setActivePinia(createPinia());
        scope = effectScope();
    });

    afterEach(() => {
        scope.stop();
        vi.unstubAllGlobals();
    });

    it('keeps the row and its side padding inside the client width at every window width', () => {
        const canvasStore = useCanvasStore();
        canvasStore.devices = [
            { key: 'mobile', width: 375 },
            { key: 'tablet', width: 768 },
            { key: 'desktop', width: 1600 },
        ] as unknown as TBricksResolvedDeviceSet;
        canvasStore.isFigmaMode = true;
        const canvas = scope.run(() => useCanvas());
        const overflows: number[] = [];

        for (let windowWidth = 1280; windowWidth <= 1920; windowWidth++) {
            vi.stubGlobal('innerWidth', windowWidth);
            // Both sidebars are closed: the area takes the window less the rail
            const area = buildCanvasArea(windowWidth - NAV_WIDTH_PX);

            if (canvas) {
                canvas.canvasContainer.value = area;
                canvasStore.setCanvasScale(canvas.calculateOptimalScale());
            }

            // Whole pixels: the min-width is a whole number of them, and the way back out
            // of rem must not add a float error of its own
            const rowWithPaddingPx = Math.round(
                parseFloat(canvas?.figmaWrapperMinWidth.value ?? '') * 10
            );

            if (rowWithPaddingPx > area.clientWidth) {
                overflows.push(windowWidth);
            }
        }

        expect(overflows).toEqual([]);
    });
});
