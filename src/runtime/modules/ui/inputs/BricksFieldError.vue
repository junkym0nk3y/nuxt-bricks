<script setup lang="ts">
/**
 * @description One look for a field error across every form (inputs, textareas,
 * arbitrary fields).
 *
 * The outer spacing is set by the context (the container's gap or a
 * fallthrough class), so the paragraph itself carries no margin.
 *
 * The paragraph announces itself (`role="alert"`): the message appears after the
 * fact — on a blur, on a submit, on a refusal of the server — and a message that
 * appears silently is a message a screen reader user never learns about. The refusal
 * of the login screen was exactly that case: visible on screen, absent by ear. The
 * role sits on the element that is created together with the text rather than on an
 * always-present container, because the text arrives with the element itself.
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
        <p v-if="props.message" role="alert" :class="$style.BricksFieldError">
            {{ props.message }}
        </p>
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
