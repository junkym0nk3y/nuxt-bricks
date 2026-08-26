// #region Imports
// Types
import type { IGridOverlayMetrics, IGridOverlayMetricsOptions } from '../types/gridOverlay';

// Vue
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

// Utils
import { parseGridTracks } from '../utils/gridDropPlacement';
// #endregion

/**
 * Measures the grid the way the browser actually laid it out: the content box and the
 * row heights the underlay of the canvas is drawn from.
 *
 * Nothing here takes part in a drop — the cell under the cursor is computed from the
 * computed style at the moment of the event. Keeping the two apart is the point: the
 * measurement is refreshed on its own schedule, and a drop must never wait for it.
 *
 * @param options - Root of the grid and the sources that invalidate a measurement.
 */
export function useGridOverlayMetrics(options: IGridOverlayMetricsOptions): IGridOverlayMetrics {
    // #region Data
    const containerSize = ref({ width: 0, height: 0 });
    const rowSizes = ref<number[]>([]);
    // #endregion

    // #region Methods
    /**
     * Re-reads the content box and the row track sizes out of the DOM.
     */
    function measure(): void {
        const container = options.containerRef.value;
        if (!container) {
            return;
        }

        const computedStyle = window.getComputedStyle(container);
        const padLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const padRight = parseFloat(computedStyle.paddingRight) || 0;
        const padTop = parseFloat(computedStyle.paddingTop) || 0;
        const padBottom = parseFloat(computedStyle.paddingBottom) || 0;

        containerSize.value = {
            width: container.offsetWidth - padLeft - padRight,
            height: container.offsetHeight - padTop - padBottom,
        };

        // Zero-height tracks are dropped: an empty row draws no line, and a zero would
        // stack several boundaries on top of each other
        rowSizes.value = parseGridTracks(computedStyle.gridTemplateRows).filter(
            (track) => track > 0
        );
    }

    /**
     * Re-measures once the DOM has caught up with the reactive change.
     */
    async function remeasureAfterPatch(): Promise<void> {
        await nextTick();
        measure();
    }
    // #endregion

    // #region Lifecycle
    onMounted(() => {
        measure();
        window.addEventListener('resize', measure);

        const resizeObserver = new ResizeObserver(measure);
        if (options.containerRef.value) {
            resizeObserver.observe(options.containerRef.value);
        }

        onBeforeUnmount(() => {
            window.removeEventListener('resize', measure);
            resizeObserver.disconnect();
        });
    });

    // The underlay is drawn from MEASURED tracks, while the observer only reports a change
    // of the outer size. Changing the number of rows, the row height or the padding leaves
    // that size where it was (min-height holds it), so without this the underlay keeps the
    // previous value: the panel shows one row while the canvas still shows the previous
    // four.
    watch(options.remeasureOn, remeasureAfterPatch);
    // #endregion

    return { containerSize, rowSizes };
}
