<script setup lang="ts">
// #region Imports
// Types
import type { ICanvasDropPlaceholderProps } from '../../types/components';

// Components
import BuilderCanvasConditionalContainer from './BuilderCanvasConditionalContainer.vue';
// #endregion

/**
 * The spot a block is about to land in: it pushes the neighbors of the flow apart and
 * repeats the actual size of the dragged block. The sizes come from the canvas CSS
 * variables (`--bricks-drag-placeholder-*`), which the drag state of the store fills in.
 *
 * A root block without `fullWidth` is rendered inside `.bricks-container` (see
 * `needsContainerWrapper` in `BuilderCanvasItem`), so an insertion point at the root is
 * wrapped in a container too — otherwise it is wider than the real block by the aside
 * padding and knows nothing about `max-width`.
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
