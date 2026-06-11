<script setup lang="ts">
// #region Imports
// Types
import type { IBricksCloseButtonEmits, IBricksCloseButtonProps } from './types.d.ts';

// Components
import BricksButton from '../button/BricksButton.vue';
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
    <BricksButton
        :size="props.size"
        variant="outline"
        :class="$style.BricksCloseButton"
        :disabled="props.disabled"
        @click="handleClick"
    >
        <BricksIcon icon="gl:close" />
    </BricksButton>
</template>

<style module lang="scss">
.BricksCloseButton {
    min-width: 3.2rem;
    min-height: 3.2rem;
    padding: 0;

    svg {
        width: 2rem;
        height: 2rem;
    }
}
</style>
