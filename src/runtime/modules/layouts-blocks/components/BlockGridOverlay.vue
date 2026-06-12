<script setup lang="ts">
// #region Imports
// Types
import type { IBlockGridOverlayProps } from '../types/blockProps';

// Utils
import {
    getColumnBoundaries,
    getColumnGapRects,
    getRowBoundaries,
    getRowGapRects,
} from '../utils/gridOverlayGeometry';

// Vue
import { computed } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockGridOverlayProps>(), {});
// #endregion

// #region Computed
const contentHeight = computed(() => props.containerSize.height);

const columnBoundaries = computed<number[]>(() =>
    getColumnBoundaries(props.containerSize.width, props.columns, props.gap)
);

const gapRects = computed(() =>
    getColumnGapRects(props.containerSize.width, props.columns, props.gap)
);

const rowBoundaries = computed<number[]>(() => getRowBoundaries(props.rowSizes, props.gap));

const horizontalGapRects = computed(() =>
    getRowGapRects(props.containerSize.width, props.rowSizes, props.gap)
);
// #endregion
</script>

<template>
    <svg
        :class="$style.BlockGridOverlay"
        :width="props.containerSize.width"
        :height="props.containerSize.height"
        :viewBox="`0 0 ${props.containerSize.width} ${props.containerSize.height}`"
        preserveAspectRatio="none"
    >
        <!-- Vertical gap highlight (columns) -->
        <rect
            v-for="(gapRect, gapIndex) in gapRects"
            :key="`col-gap-${gapIndex}`"
            :x="gapRect.x"
            :y="0"
            :width="gapRect.width"
            :height="contentHeight"
            fill="rgb(var(--rgb-indigo) / 12%)"
        />

        <!-- Horizontal gap highlight (rows) -->
        <rect
            v-for="(gapRect, gapIndex) in horizontalGapRects"
            :key="`row-gap-${gapIndex}`"
            :x="0"
            :y="gapRect.y"
            :width="props.containerSize.width"
            :height="gapRect.height"
            fill="rgb(var(--rgb-indigo) / 12%)"
        />

        <!-- Vertical lines (columns) -->
        <line
            v-for="(position, index) in columnBoundaries"
            :key="`v-${index}`"
            :x1="position"
            :y1="0"
            :x2="position"
            :y2="props.containerSize.height"
            stroke="rgba(99, 102, 241, 0.4)"
            stroke-width="1"
        />

        <!-- Horizontal lines (rows) -->
        <line
            v-for="(position, index) in rowBoundaries"
            :key="`h-${index}`"
            :x1="0"
            :y1="position"
            :x2="props.containerSize.width"
            :y2="position"
            stroke="rgba(99, 102, 241, 0.4)"
            stroke-width="1"
        />
    </svg>
</template>

<style module lang="scss">
.BlockGridOverlay {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    pointer-events: none;
}
</style>
