/**
 * @vitest-environment happy-dom
 *
 * A transform leaves the layout box of a scaled node unscaled: below a scale of 1 the
 * scroll area of the canvas kept the unscaled height and scrolled on into emptiness, and
 * above it the padding under the sheet went out of reach. A bottom margin brings the flow
 * height of the node to its visual one — for the normal canvas out of the store height,
 * for the row of Figma mode out of its measured layout height.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { effectScope, nextTick, type EffectScope } from 'vue';

// Composables and stores of the builder
import { useCanvas } from '../../src/runtime/modules/builder/canvas/viewport/composables/useCanvas';
import { useCanvasStore } from '../../src/runtime/modules/builder/core/stores/canvas';
// #endregion

/** Callbacks of the observers the composable created, latest last */
const observerCallbacks: ResizeObserverCallback[] = [];

/** Elements under observation now: a disconnect drops them */
const observedElements: Element[] = [];

/**
 * Observer that only records: happy-dom lays nothing out and reports no size. The
 * composable keeps a single observer and disconnects it before observing a new node.
 */
class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
        observerCallbacks.push(callback);
    }

    observe(element: Element): void {
        observedElements.push(element);
    }

    disconnect(): void {
        observedElements.length = 0;
    }
}

describe('bottom margin of the scaled canvas', () => {
    let scope: EffectScope;

    beforeEach(() => {
        observerCallbacks.length = 0;
        observedElements.length = 0;
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        setActivePinia(createPinia());
        scope = effectScope();
    });

    afterEach(() => {
        scope.stop();
        vi.unstubAllGlobals();
    });

    it('brings the flow height of the normal canvas to its visual height', () => {
        const canvasStore = useCanvasStore();
        const canvas = scope.run(() => useCanvas());
        canvasStore.height = 1000;

        canvasStore.setCanvasScale(0.5);
        expect(canvas?.canvasMarginBottom.value).toBe('-50rem');

        // Above a scale of 1 the flow grows, and the padding under the sheet is reachable
        canvasStore.setCanvasScale(1.5);
        expect(canvas?.canvasMarginBottom.value).toBe('50rem');
    });

    it('gives the row of Figma mode its visual height out of the measured one', async () => {
        const canvasStore = useCanvasStore();
        const canvas = scope.run(() => useCanvas());
        const row = document.createElement('div');
        Object.defineProperty(row, 'offsetHeight', { value: 2000 });
        canvasStore.setCanvasScale(0.5);

        // Nothing is measured yet: the row keeps its flow
        expect(canvas?.figmaWrapperMarginBottom.value).toBe('0rem');

        if (canvas) {
            canvas.figmaWrapper.value = row;
        }
        await nextTick();
        observerCallbacks.at(-1)?.([], {} as ResizeObserver);

        expect(observedElements).toEqual([row]);
        expect(canvas?.figmaWrapperMarginBottom.value).toBe('-100rem');
    });
});
