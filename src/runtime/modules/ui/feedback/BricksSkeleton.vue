<script setup lang="ts">
/**
 * @description Заглушка на месте содержимого, которое ещё едет. Своя у неё
 * только заливка и радиус — размеры задаёт вызывающий, потому что в каждом из
 * мест они свои (превью 16:10, строка списка, полоса подписи).
 *
 * Заглушка скрыта от скринридера: она ничего не сообщает, а озвученная как
 * пустой элемент только мешает. Состояние загрузки объявляет тот, кто её
 * показывает.
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
