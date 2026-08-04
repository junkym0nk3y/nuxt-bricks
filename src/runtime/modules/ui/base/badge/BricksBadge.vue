<script setup lang="ts">
// #region Imports
// Types
import type { IBricksBadgeProps, TBricksBadgeVariant } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksBadgeProps>(), {
    variant: 'primary',
});
// #endregion

// #region Data
const $style = useCssModule();

/** Классы вариантов — карта вместо обращения по вычисленному ключу: так набор
 *  вариантов проверяется типом, а не совпадением имени класса в рантайме. */
const VARIANT_CLASS: Record<TBricksBadgeVariant, string> = {
    primary: $style._primary,
    neutral: $style._neutral,
};
// #endregion

// #region Computed
const variantClass = computed<string>(() => VARIANT_CLASS[props.variant]);
// #endregion
</script>

<template>
    <span :class="[$style.BricksBadge, variantClass]">
        <slot />
    </span>
</template>

<style module lang="scss">
.BricksBadge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0.2rem 0.6rem;
    border-radius: 0.4rem;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.4;
    gap: 0.2rem;
}

._primary {
    background: var(--bricks-primary);
    color: var(--bricks-static-white);
}

._neutral {
    background: var(--bricks-base-200);
    color: var(--bricks-base-600);
}
</style>
