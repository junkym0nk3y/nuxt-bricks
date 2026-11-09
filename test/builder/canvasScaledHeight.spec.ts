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
import { getRemCompensationStyle } from '../../src/runtime/modules/builder/canvas/viewport/composables/useCanvasRemBase';
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

    it('keeps the rem compensation out of the transform and in the sheet height', () => {
        // A vw rem base of 1024px is 7.11px: the content of the sheet is zoomed by 0.711,
        // the sheet itself stays 1024px wide — the container queries measure it
        const canvasStore = useCanvasStore();
        const canvas = scope.run(() => useCanvas());
        canvasStore.setDevices([
            {
                key: 'mobile',
                label: 'Mobile',
                icon: 'device-mobile',
                width: 375,
                aside: 1.2,
                remBase: '10px',
                canvasHeight: 812,
            },
            {
                key: 'desktop',
                label: 'Laptop',
                icon: 'device-laptop',
                width: 1024,
                aside: 1.2,
                remBase: '0.6944vw',
                canvasHeight: 768,
            },
        ]);
        canvasStore.setViewport('desktop');
        canvasStore.height = 1000;
        canvasStore.setCanvasScale(0.5);

        expect(canvas?.remCompensation.value).toBeCloseTo(0.711, 3);
        expect(canvas?.canvasTransform.value).toBe('scale(0.5)');
        expect(canvas?.canvasWrapperStyle.value).toEqual({ minWidth: '51.2rem' });
        expect(canvas?.sheetLayoutHeight.value).toBeCloseTo(711.07, 2);
        expect(parseFloat(canvas?.canvasMarginBottom.value ?? '')).toBeCloseTo(-35.553, 3);
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

describe('content of a sheet under a rem compensation', () => {
    it('lays the content out at the rem width of the page and scales it to the sheet', () => {
        // A laptop of 1024px at 7.11px per rem: 144rem of content in a 1024px sheet
        expect(getRemCompensationStyle(0.711066)).toEqual({
            width: `${100 / 0.711066}%`,
            transform: 'scale(0.711066)',
            transformOrigin: 'top left',
        });
    });

    it('leaves the content alone without a compensation or with a broken one', () => {
        expect(getRemCompensationStyle(1)).toBeUndefined();
        expect(getRemCompensationStyle(0)).toBeUndefined();
        expect(getRemCompensationStyle(Number.NaN)).toBeUndefined();
        expect(getRemCompensationStyle(Number.POSITIVE_INFINITY)).toBeUndefined();
    });

    it.each(['0px', '-1px', 'Infinitypx'])(
        'keeps the sheet geometry whole under an unusable rem base %s',
        (remBase) => {
            // The device validator checks only the type of remBase: a factor of 0 gave the
            // sheet no height, and Infinity gave it an infinite one
            setActivePinia(createPinia());
            const scope = effectScope();
            const canvasStore = useCanvasStore();
            const canvas = scope.run(() => useCanvas());
            canvasStore.setDevices([
                {
                    key: 'mobile',
                    label: 'Mobile',
                    icon: 'device-mobile',
                    width: 375,
                    aside: 1.2,
                    remBase: '10px',
                    canvasHeight: 812,
                },
                {
                    key: 'desktop',
                    label: 'Desktop',
                    icon: 'device-desktop',
                    width: 1440,
                    aside: 1.2,
                    remBase,
                    canvasHeight: 900,
                },
            ]);
            canvasStore.setViewport('desktop');
            canvasStore.height = 1000;

            expect(canvas?.remCompensation.value).toBe(1);
            expect(canvas?.getRemCompensation('desktop')).toBe(1);
            expect(canvas?.sheetLayoutHeight.value).toBe(1000);
            scope.stop();
        }
    );
});
