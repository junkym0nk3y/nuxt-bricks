<script setup lang="ts">
// #region Imports
import type { ICanvasEmptyStateData } from '../../types/canvas';
// #endregion

// #region Data
const emptyState: ICanvasEmptyStateData = {
    icon: 're:drag-drop-line',
    title: 'Добавьте новые компоненты',
    description:
        'Откройте библиотеку компонентов и с помощью drag & drop - добавляйте структуру будущей страницы',
};
// #endregion
</script>

<template>
    <div :class="$style.BuilderCanvasEmptyState">
        <BricksIcon :class="$style.emptyIcon" :icon="emptyState.icon" />
        <h3 :class="$style.emptyTitle">
            {{ emptyState.title }}
        </h3>
        <p :class="$style.emptyText">
            {{ emptyState.description }}
        </p>
    </div>
</template>

<style module lang="scss">
.BuilderCanvasEmptyState {
    position: absolute;
    top: 50%;
    left: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--bricks-base-300);
    transform: translate(-50%, -50%);
    flex-direction: column;
    pointer-events: none;
}

.emptyIcon {
    display: block;
    margin-bottom: 1.6rem;
    font-size: 8rem;
    color: var(--bricks-base-300);
}

.emptyTitle {
    margin: 0 0 0.8rem 0;
    font-size: 2rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.emptyText {
    max-width: 30rem;
    margin: 0;
    font-size: 1.4rem;
}
</style>
