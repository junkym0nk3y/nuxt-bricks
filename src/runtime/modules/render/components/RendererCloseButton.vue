<script setup lang="ts">
// TODO: получит уникальный стиль при редизайне (сейчас — самодостаточная копия
// ui/base/modal/BricksCloseButton; render не импортирует ui — правило render-lean).

// #region Interfaces
interface IRendererCloseButtonProps {
    disabled?: boolean;
}

interface IRendererCloseButtonEmits {
    click: [event: MouseEvent];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IRendererCloseButtonProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IRendererCloseButtonEmits>();
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
        :class="$style.RendererCloseButton"
        :disabled="props.disabled"
        @click="handleClick"
    >
        <BricksIcon icon="ta:outline-x" />
    </button>
</template>

<style module lang="scss">
.RendererCloseButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 3.2rem;
    min-height: 3.2rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-md);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    color: var(--bricks-base-600);
    cursor: pointer;

    &:not(:disabled):hover {
        background-color: var(--bricks-base-300);
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
