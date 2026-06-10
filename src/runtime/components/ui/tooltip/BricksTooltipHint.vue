<script setup lang="ts">
/**
 * @description Компонент для отображения текстового содержимого тултипа
 */

// #region Imports
import type { IIdaTooltipHintProps } from './types.d.ts';
// #endregion

// #region Props
const props = withDefaults(defineProps<IIdaTooltipHintProps>(), {
    text: '',
});
// #endregion
</script>

<template>
    <div :class="$style.tooltipHint">
        {{ props.text }}
    </div>
</template>

<style module lang="scss">
.tooltipHint {
    /* Фиксируем светлую тему для тултипов */
    --land-base-0: #fff;
    --land-base-300: #d1d5db;
    --land-base-900: #111827;
    --rgb-base-900: 17 24 39;

    max-width: 24rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--land-base-300);
    background: var(--land-base-0);
    text-align: center;
    white-space: normal;
    font-size: var(--font-size-sm);
    color: var(--land-base-900);
    overflow-wrap: break-word;
    box-shadow: var(--shadow-md);
}
</style>
