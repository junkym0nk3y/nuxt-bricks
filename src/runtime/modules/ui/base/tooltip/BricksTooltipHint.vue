<script setup lang="ts">
/**
 * @description Renders the text content of a tooltip.
 *
 * The tooltip is teleported into `body`, so theme-dependent tokens resolve
 * against the `.bricks-dark` class on `body` rather than against a wrapper.
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
    max-width: 24rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    text-align: center;
    white-space: normal;
    font-size: var(--bricks-font-size-sm);
    color: var(--bricks-base-900);
    overflow-wrap: break-word;
    box-shadow: var(--bricks-shadow-md);
}
</style>
