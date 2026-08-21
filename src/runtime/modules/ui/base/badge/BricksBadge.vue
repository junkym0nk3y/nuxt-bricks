<script setup lang="ts">
/**
 * @description Badge: a short value next to a name. The role had been written
 * five times — the "you" marker in an account row, "current" on a page version,
 * the role pill, the keyword chip and this badge itself — and had drifted apart
 * in radius, font size and padding.
 *
 * The geometry is set by the shape and the font size, not by the caller through a
 * class: overriding a class with a class would be decided by style order. The one
 * place that cannot avoid a geometry of its own (the round badge of the selected
 * file in the media library) overrides it deliberately and says so in a comment
 * on its own side.
 *
 * There is one font size for every badge: the `1.2rem` and `1.1rem` steps
 * differed to the eye only in weight, and `1.1rem` is outside the `0.2rem`
 * multiple scale.
 *
 * The `plain` tone drops its border by width rather than by color: a transparent
 * border from the base rule would add `0.2rem` of box to the status dot, and the
 * circle would stop matching the previous one. Its padding is dropped by a pair
 * of classes rather than by `._plain` alone — with a single class the outcome
 * would depend on rule order in the file rather than on intent, and without a
 * fill the padding would only push the caption away from its neighbor.
 */

// #region Imports
// Types
import type { IBricksBadgeProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksBadgeProps>(), {
    tone: 'primary',
    shape: 'rounded',
    dot: '',
    as: 'span',
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [
    $style.BricksBadge,
    $style[`_${props.tone}`],
    $style[`_${props.shape}`],
]);
// #endregion
</script>

<template>
    <component
        :is="props.as"
        :class="rootClasses"
        :type="props.as === 'button' ? 'button' : undefined"
    >
        <span v-if="props.dot" :class="[$style.dot, $style[`_dot-${props.dot}`]]" />

        <slot />
    </component>
</template>

<style module lang="scss">
.BricksBadge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    border: 1px solid transparent;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    gap: 0.4rem;
    line-height: 1.4;
}

._rounded {
    padding: 0.2rem 0.6rem;
    border-radius: 0.4rem;
}

._pill {
    padding: 0.2rem 0.8rem;
    border-radius: var(--bricks-border-radius-pill);
}

._primary {
    background: var(--bricks-primary);
    color: var(--bricks-static-white);
}

._neutral {
    background: var(--bricks-base-200);
    color: var(--bricks-base-600);
}

._muted {
    background: var(--bricks-base-100);
    color: var(--bricks-base-600);
}

._accent {
    background: var(--bricks-primary-50);
    color: var(--bricks-primary-600);
}

._quiet {
    border-color: var(--bricks-base-200);
    background: var(--bricks-base-50);
    color: var(--bricks-base-500);
}

._plain {
    border-width: 0;
    background: transparent;
    color: var(--bricks-base-500);
}

._plain._rounded,
._plain._pill {
    padding: 0;
}

.dot {
    flex-shrink: 0;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
}

._dot-neutral {
    background: var(--bricks-base-300);
}

._dot-positive {
    background: var(--bricks-green);
}
</style>
