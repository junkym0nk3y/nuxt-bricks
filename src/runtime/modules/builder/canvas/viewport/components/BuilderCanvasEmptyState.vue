<script setup lang="ts">
// #region Imports
// Vue
import { useI18n } from 'vue-i18n';
// #endregion

// #region Data
const { t } = useI18n();
// #endregion
</script>

<template>
    <div :class="$style.BuilderCanvasEmptyState">
        <BricksIcon :class="$style.emptyIcon" icon="re:drag-drop-line" />
        <h3 :class="$style.emptyTitle">
            {{ t('bricks.canvas.emptyTitle') }}
        </h3>
        <p :class="$style.emptyText">
            {{ t('bricks.canvas.emptyDescription') }}
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
