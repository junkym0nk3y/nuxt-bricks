<script setup lang="ts">
// #region Imports
import type { IRendererPlaceholderProps } from '../types/render';
// #endregion

// #region Props
const props = withDefaults(defineProps<IRendererPlaceholderProps>(), {
    title: 'Компонент недоступен',
    description: 'Проверьте storyPath или перегенерируйте схему.',
});
// #endregion
</script>

<template>
    <div :class="$style.RendererPlaceholder">
        <h3 :class="$style.title">
            {{ props.title }}
        </h3>
        <p :class="$style.description">
            {{ props.description }}
        </p>
    </div>
</template>

<style module lang="scss">
.RendererPlaceholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 10rem;
    padding: 2rem;
    border-radius: 0.8rem;
    border: 0.2rem dashed var(--bricks-base-300);
    background-color: var(--bricks-base-50);
    text-align: center;
    color: var(--bricks-base-500);
    flex-direction: column;
    gap: 1.6rem;
}

.title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
}

.description {
    margin: 0;
    font-size: 1.4rem;
}
</style>
