<script setup lang="ts">
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
    <Transition mode="out-in" name="library-fade-fast">
        <p v-if="props.message" :class="$style.BricksFieldError">{{ props.message }}</p>
    </Transition>
</template>

<style lang="scss" module>
// Единый вид ошибки поля для всех форм (инпуты, textarea, произвольные поля).
// Внешние отступы задаёт контекст (gap контейнера или класс-fallthrough).
.BricksFieldError {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-danger-500);
}
</style>
