<script setup lang="ts">
// #region Imports
// #endregion

// #region Interfaces
/**
 * Пропсы для компонента BuilderCanvasConditionalContainer
 */
interface ICanvasConditionalContainerProps {
    /** Нужно ли оборачивать контент в div.bricks-container */
    useContainer: boolean;
}
// #endregion

// #region Props
const props = defineProps<ICanvasConditionalContainerProps>();
// #endregion
</script>

<template>
    <div v-if="props.useContainer" class="bricks-container">
        <slot />
    </div>
    <slot v-else />
</template>
