<script setup lang="ts">
// #region Imports
// Types
import type { IBricksCloseButtonEmits, IBricksCloseButtonProps } from './types.d.ts';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksCloseButtonProps>(), {
    disabled: false,
    size: 'sm',
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksCloseButtonEmits>();
// #endregion

// #region Methods
/**
 * Пробрасывает клик наружу.
 *
 * @param event - MouseEvent.
 */
function handleClick(event: MouseEvent): void {
    emit('click', event);
}
// #endregion
</script>

<template>
    <button
        type="button"
        :class="$style.BricksCloseButton"
        :disabled="props.disabled"
        @click="handleClick"
    >
        <BricksIcon icon="ta:outline-x" />
    </button>
</template>

<style module lang="scss">
// Точная реализация узла Figma Close Button (174:190): фон surface-raised,
// радиус 0.8rem, иконка base-600, без бордера.
.BricksCloseButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-control);
    border: none;
    background-color: var(--bricks-surface-raised);
    color: var(--bricks-base-600);
    transition:
        color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:not(:disabled):hover {
        color: var(--bricks-base-900);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    svg {
        width: 2rem;
        height: 2rem;
    }
}
</style>
