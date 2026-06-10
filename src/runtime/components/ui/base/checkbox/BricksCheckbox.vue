<script setup lang="ts">
// #region Imports
// Vue
import { useCssModule, computed } from 'vue';

// Reka UI
import { CheckboxRoot } from 'reka-ui';

// Types
import type { IIdaCheckboxProps, IIdaCheckboxEmits } from './types.d.ts';
// #endregion

// #region Props
const props = withDefaults(defineProps<IIdaCheckboxProps>(), {
    disabled: false,
    label: '',
    size: 'md',
    name: 'checkbox',
});
// #endregion

// #region Emits
const emit = defineEmits<IIdaCheckboxEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const active = computed(() => {
    if (Array.isArray(props.value)) {
        return props.value.includes(true);
    }

    return props.value;
});

const classList = computed(() => [
    {
        [$style._active]: active.value,
        [$style._disabled]: props.disabled,
        [$style[`_${props.size}`]]: props.size,
    },
]);
// #endregion

// #region Methods
/**
 * Handles checkbox state change and emits new value
 */
function onUpdate(value: boolean | 'indeterminate'): void {
    emit('update:value', value === true);
}

/**
 * Toggles checkbox on Enter key (parity with native behaviour)
 */
function onEnter(): void {
    if (props.disabled) {
        return;
    }

    emit('update:value', !active.value);
}

/**
 * Handles focus event
 */
function onFocus(event: FocusEvent): void {
    emit('focus', event);
}

/**
 * Handles blur event
 */
function onBlur(event: FocusEvent): void {
    emit('blur', event);
}

/**
 * Handles keydown event
 */
function onKeydown(event: KeyboardEvent): void {
    emit('keydown', event);
}
// #endregion
</script>

<template>
    <CheckboxRoot
        :model-value="active"
        :disabled="props.disabled"
        :name="props.name"
        :class="[$style.BricksCheckbox, classList]"
        @update:model-value="onUpdate"
        @keydown.enter.stop.prevent="onEnter"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
    >
        <span :class="$style.input"></span>

        <span v-if="props.label" :class="$style.label" v-text="props.label"></span>
    </CheckboxRoot>
</template>

<style lang="scss" module>
.BricksCheckbox {
    position: relative;
    display: inline-flex;
    align-items: center;
    border: none;
    background: transparent;
    user-select: none;
    outline: none;
    cursor: pointer;

    .label {
        font-weight: 500;
        color: var(--land-base-900);
        transition: color var(--default-transition);
    }

    .input {
        position: relative;
        flex-shrink: 0;
        border-radius: var(--border-radius-xs);
        border: 1px solid var(--land-base-300);
        background: transparent;
        color: var(--land-base-50);
        transition: all var(--default-transition);

        &:after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            border-radius: 0.2rem;
            background-color: currentcolor;
            opacity: 0;
            transform: translate(-50%, -50%) scale(0);
            transition:
                opacity var(--default-transition),
                transform var(--default-transition);
            -webkit-mask-repeat: no-repeat;
            mask-repeat: no-repeat;
            -webkit-mask-position: center;
            mask-position: center;
            mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10.06 10.06'%3E%3Cpath d='M9.74,1.82a1,1,0,0,1,0,1.42l-5,5a1,1,0,0,1-1.42,0l-3-3A1,1,0,0,1,1.74,3.82L4,6.12l4.29-4.3A1,1,0,0,1,9.74,1.82Z'/%3E%3C/svg%3E");
            /* stylelint-disable */
            /* postcss-ignore-line */
            -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10.06 10.06'%3E%3Cpath d='M9.74,1.82a1,1,0,0,1,0,1.42l-5,5a1,1,0,0,1-1.42,0l-3-3A1,1,0,0,1,1.74,3.82L4,6.12l4.29-4.3A1,1,0,0,1,9.74,1.82Z'/%3E%3C/svg%3E");
            /* stylelint-enable */
        }
    }

    &._sm {
        .input {
            width: 1.2rem;
            height: 1.2rem;
            border-radius: 0.2rem;

            &:after {
                width: 0.6rem;
                height: 0.6rem;
            }
        }

        .label {
            margin-left: 0.6rem;
            font-size: 1.2rem;
        }
    }

    &._md {
        .input {
            width: 1.6rem;
            height: 1.6rem;
            border-radius: 0.4rem;

            &:after {
                width: 0.8rem;
                height: 0.8rem;
            }
        }

        .label {
            margin-left: 0.8rem;
            font-size: 1.4rem;
        }
    }

    &._disabled {
        opacity: 0.6;
        cursor: not-allowed;

        .input,
        .label {
            pointer-events: none;
        }
    }

    &._active {
        .input {
            border-color: var(--land-primary);
            background-color: var(--land-primary);

            &:after {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
        }
    }

    &:focus-within {
        .input {
            border-color: var(--land-primary);
            outline: none;
        }
    }

    &:hover:not(._disabled) {
        .input {
            border-color: var(--land-primary);
        }

        .label {
            color: var(--land-primary);
        }
    }
}
</style>
