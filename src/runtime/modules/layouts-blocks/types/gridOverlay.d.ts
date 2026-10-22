/**
 * Types of the measurements the grid underlay of a BlockGrid is drawn from
 * (composables/useGridOverlayMetrics).
 */

import type { Ref, WatchSource } from 'vue';

export interface IGridOverlayMetricsOptions {
    /** Root element of the grid */
    containerRef: Ref<HTMLElement | null>;

    /**
     * Sources that invalidate the measurement without changing the outer size of the
     * block, so the size observer stays silent about them.
     */
    remeasureOn: WatchSource[];
}

export interface IGridOverlayMetrics {
    /** Content box of the grid (without the padding), in CSS pixels */
    containerSize: Ref<{ width: number; height: number }>;

    /** Row heights as the browser laid them out */
    rowSizes: Ref<number[]>;
}
