<script setup lang="ts">
// #region Imports
// #endregion

// #region Interfaces
/**
 * Пропсы для компонента ConditionalContainer
 */
interface IConditionalContainerProps {
    /** Нужно ли оборачивать контент в div.container */
    useContainer: boolean;
}
// #endregion

// #region Props
const props = defineProps<IConditionalContainerProps>();
// #endregion
</script>

<template>
    <div v-if="props.useContainer" class="container">
        <slot />
    </div>
    <slot v-else />
</template>
