<script setup lang="ts">
/**
 * @description A placeholder standing in for content that is still on its way.
 * All it owns is the fill and the radius — the dimensions are set by the caller,
 * because they differ in every place (a 16:10 preview, a list row, a caption
 * bar).
 *
 * The placeholder is hidden from screen readers: it announces nothing, and read
 * out as an empty element it only gets in the way. The loading state is
 * announced by whoever shows it.
 */

// #region Imports
// Types
import type { IBricksSkeletonProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSkeletonProps>(), {
    shape: 'line',
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [$style.BricksSkeleton, $style[`_${props.shape}`]]);
// #endregion
</script>

<template>
    <span :class="rootClasses" aria-hidden="true" />
</template>

<style module lang="scss">
.BricksSkeleton {
    display: block;
    background: var(--bricks-base-100);
}

._line {
    border-radius: var(--bricks-border-radius-pill);
}

._block {
    border-radius: var(--bricks-border-radius-xs);
}
</style>
