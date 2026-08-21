<script setup lang="ts">
/**
 * @description Floating surface: radius, border, background, shadow and layer.
 * Everything that had been written thirteen times — from the select dropdown to
 * the canvas context menu — and had already drifted apart: one and the same role
 * turned up with an `sm`, an `md` and an `lg` shadow.
 *
 * **It deliberately takes no part in positioning.** Some surfaces are placed by
 * reka (`SelectContent`, `DropdownMenuContent`, `PopoverContent`), some by their
 * own `position: absolute` against a parent, some by `position: fixed` out of a
 * `Teleport` at selection coordinates. Imposing a single way would mean
 * rewriting working logic in ten places for the sake of a shared look; so the
 * geometry (width, coordinates, appearance animation) is still set by the caller
 * through its own class — that class lands on this very node.
 *
 * With reka surfaces the component is composed through `as-child`: then the node
 * stays single, and the `data-state` the caller hangs its animation on sits in
 * the same place as its class.
 */

// #region Imports
// Types
import type { IBricksPopoverSurfaceProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksPopoverSurfaceProps>(), {
    density: 'default',
    elevation: 'md',
    layer: 'popover',
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
/**
 * `layer: 'none'` prints no layer class at all rather than printing an empty one:
 * in that case the layer is owned by the caller (or by reka, if the surface sits
 * inside its content), and an extra class in the list would fight its value at
 * equal specificity.
 */
const rootClasses = computed(() => [
    $style.BricksPopoverSurface,
    $style[`_${props.density}`],
    $style[`_${props.elevation}`],
    props.layer === 'none' ? null : $style[`_layer-${props.layer}`],
]);
// #endregion
</script>

<template>
    <div :class="rootClasses">
        <slot />
    </div>
</template>

<style module lang="scss">
.BricksPopoverSurface {
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

._compact {
    padding: 0.4rem;
}

._default {
    padding: 0.6rem;
}

._roomy {
    padding: 0.8rem;
}

._flush {
    padding: 0;
}

._sm {
    box-shadow: var(--bricks-shadow-sm);
}

._md {
    box-shadow: var(--bricks-shadow-md);
}

._lg {
    box-shadow: var(--bricks-shadow-lg);
}

._layer-popover {
    z-index: var(--bricks-z-popover);
}

._layer-local {
    z-index: 1;
}
</style>
