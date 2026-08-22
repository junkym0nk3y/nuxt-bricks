<script setup lang="ts">
// #region Interfaces
/**
 * Props of the BuilderCanvasConditionalContainer component
 */
interface ICanvasConditionalContainerProps {
    /** Whether the content has to be wrapped in div.bricks-container */
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
