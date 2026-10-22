<script setup lang="ts">
// #region Imports
// Types
import type { ICanvasConditionalContainerProps } from '../../types/components';
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
