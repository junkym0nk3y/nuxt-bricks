<script setup lang="ts">
// #region Imports
// Types
import type { ILandDemoValues } from '../../common/types/index';
import type { ILandUiCommonProp } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        spec: ILandUiCommonProp;
        value: ILandDemoValues;
        disabled?: boolean;
        isHighlighted?: boolean;
    }>(),
    {
        isHighlighted: false,
        disabled: false,
    }
);
// #endregion

// #region Emits
const emit = defineEmits<{
    click: [value: ILandUiCommonProp];
}>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const isSelected = computed(() => props.value === props.spec.value);

const classList = computed(() => [
    {
        [$style._highlighted]: props.isHighlighted,
        [$style._selected]: isSelected.value,
        [$style._disabled]: props.disabled,
    },
]);
// #endregion

// #region Methods
/**
 * Handles option click and emits click event with spec data
 */
function onOptionClick(): void {
    emit('click', props.spec);
}

// #endregion
</script>

<template>
    <div :class="[$style.BricksSelectOption, classList]" @click="onOptionClick">
        {{ props.spec?.label }}
    </div>
</template>

<style lang="scss" module>
.BricksSelectOption {
    padding: 1rem 2.4rem;
    border-radius: var(--border-radius-sm);
    background-color: transparent;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.2rem;
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;
    user-select: none;

    &._selected {
        border-radius: var(--border-radius-sm);
        background-color: var(--land-base-300);
    }

    &._highlighted,
    &._selected {
        border-radius: var(--border-radius-sm);
        background-color: var(--land-base-300);
    }

    &._disabled {
        &:not(._selected) {
            opacity: 0.4;
            transition: var(--default-transition);
            cursor: not-allowed;
            pointer-events: none;
        }
    }

    .itemWrapper {
        display: flex;
        align-items: flex-start;
        flex-direction: column;
    }

    .itemHead {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
    }
}
</style>
