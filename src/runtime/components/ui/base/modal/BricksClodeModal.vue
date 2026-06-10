<script setup lang="ts">
// #region Imports
// Types
import type { IIdaClodeModalEmits, IIdaClodeModalProps } from './types.d.ts';

// Components
import BricksButton from '../button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IIdaClodeModalProps>(), {
    disabled: false,
    size: 'sm',
});
// #endregion

// #region Emits
const emit = defineEmits<IIdaClodeModalEmits>();
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
        :class="$style.BricksClodeModal"
        :disabled="props.disabled"
        @click="handleClick"
    >
        <BricksLandIcon icon="gl:close" />
    </BricksButton>
</template>

<style module lang="scss">
.BricksClodeModal {
    min-width: 3.2rem;
    min-height: 3.2rem;
    padding: 0;

    svg {
        width: 2rem;
        height: 2rem;
    }
}
</style>
