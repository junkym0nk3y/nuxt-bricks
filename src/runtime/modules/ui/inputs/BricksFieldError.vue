<script setup lang="ts">
/**
 * @description One look for a field error across every form (inputs, textareas,
 * arbitrary fields).
 *
 * The outer spacing is set by the context (the container's gap or a
 * fallthrough class), so the paragraph itself carries no margin.
 */

// #region Imports
// Types
import type { IBricksFieldErrorProps } from './types.d.ts';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksFieldErrorProps>(), {
    message: null,
});
// #endregion
</script>

<template>
    <Transition mode="out-in" name="bricks-fade-fast">
        <p v-if="props.message" :class="$style.BricksFieldError">{{ props.message }}</p>
    </Transition>
</template>

<style lang="scss" module>
.BricksFieldError {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-danger-500);
}
</style>
