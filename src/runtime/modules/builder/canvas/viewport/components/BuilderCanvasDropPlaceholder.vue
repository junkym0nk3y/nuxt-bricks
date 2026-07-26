<script setup lang="ts">
// #region Imports
// Types
import type { ICanvasDropPlaceholderProps } from '../../types/components';

// Components
import BuilderCanvasConditionalContainer from './BuilderCanvasConditionalContainer.vue';
// #endregion

/**
 * Место будущей вставки блока: раздвигает соседей в потоке и повторяет
 * фактический размер перетаскиваемого блока. Размеры приходят из CSS-переменных
 * канваса (`--bricks-drag-placeholder-*`), которые заполняет drag-состояние стора.
 *
 * Root-блок без `fullWidth` рендерится внутри `.bricks-container`
 * (см. `needsContainerWrapper` в `BuilderCanvasItem`), поэтому место вставки
 * в корне тоже оборачивается в контейнер — иначе оно шире реального блока
 * на aside-отступы и не знает про `max-width`.
 */

// #region Props
const props = withDefaults(defineProps<ICanvasDropPlaceholderProps>(), {
    contained: false,
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderCanvasDropPlaceholder" aria-hidden="true">
        <BuilderCanvasConditionalContainer :use-container="props.contained">
            <div :class="$style.frame" />
        </BuilderCanvasConditionalContainer>
    </div>
</template>

<style module lang="scss">
.BuilderCanvasDropPlaceholder {
    z-index: 5;
    flex: none;
    width: 100%;
    pointer-events: none;
}

.frame {
    box-sizing: border-box;
    width: var(--bricks-drag-placeholder-flow-width);
    height: var(--bricks-drag-placeholder-height);
    border: 0.2rem dashed var(--bricks-primary);
    background: color-mix(in srgb, var(--bricks-primary) 7%, transparent);
}
</style>
