<script setup lang="ts">
/**
 * @description Компонент для отображения текстового содержимого тултипа
 */

// #region Imports
import type { IBricksTooltipHintProps } from './types.d.ts';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTooltipHintProps>(), {
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
    /* Тултип телепортируется в body — темозависимые токены резолвятся от .bricks-dark на body */
    max-width: 24rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    text-align: center;
    white-space: normal;
    font-size: var(--font-size-sm);
    color: var(--bricks-base-900);
    overflow-wrap: break-word;
    box-shadow: var(--shadow-md);
}
</style>
