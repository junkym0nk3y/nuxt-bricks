<script setup lang="ts">
// #region Imports
// Types
import type { IBricksSelectOptionProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSelectOptionProps>(), {});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const isSelected = computed(() => props.value === props.spec.value);

const classList = computed(() => [
    {
        [$style._selected]: isSelected.value,
    },
]);
// #endregion
</script>

<template>
    <div :class="[$style.BricksSelectOption, classList]">
        {{ props.spec?.label }}
    </div>
</template>

<style lang="scss" module>
.BricksSelectOption {
    padding: 0.8rem 1.2rem;
    border-radius: var(--bricks-border-radius-xs);
    background-color: transparent;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.4rem;
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;
    user-select: none;

    &._selected {
        background-color: var(--bricks-primary-50);
        color: var(--bricks-primary);
    }
}
</style>
