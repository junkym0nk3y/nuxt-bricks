<script setup lang="ts">
// #region Imports
// Types
import type { IBricksSwitchProps, IBricksSwitchEmits } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';

// Reka UI
import { SwitchRoot } from 'reka-ui';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSwitchProps>(), {
    trueValue: false,
    falseValue: false,
    disabled: false,
    trueLabel: 'true',
    falseLabel: 'false',
    size: 'medium',
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksSwitchEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const active = computed(() => props.value === props.trueValue);

const classList = computed(() => [
    {
        [$style._disabled]: props.disabled,
        [$style._active]: active.value,
        [$style._notChecked]: !active.value,
        [$style._oneSide]: Boolean(props?.trueLabel === ''),
        [$style._small]: props.size === 'small',
    },
]);
// #endregion

// #region Methods
/**
 * Maps the boolean switch state back to trueValue/falseValue and emits it.
 *
 * @param checked - New checked state from the Reka primitive.
 */
function onUpdate(checked: boolean): void {
    emit('update:value', checked ? props.trueValue : props.falseValue);
}
// #endregion
</script>

<template>
    <SwitchRoot
        :model-value="active"
        :disabled="props.disabled"
        :class="[$style.BricksSwitch, classList]"
        @update:model-value="onUpdate"
    >
        <span
            v-if="props.falseLabel"
            :class="[$style.label, $style._left]"
            v-text="props.falseLabel"
        ></span>

        <span :class="$style.core"></span>

        <span
            v-if="props.trueLabel"
            :class="[$style.label, $style._right]"
            v-text="props.trueLabel"
        ></span>
        <slot></slot>
    </SwitchRoot>
</template>

<style lang="scss" module>
.BricksSwitch {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: none;
    background: transparent;
    outline: none;
    transition: opacity var(--default-transition);
    cursor: pointer;
    user-select: none;

    &._oneSide {
        &._active .label._left {
            color: var(--bricks-base-300);
        }

        .label {
            &._left {
                color: var(--bricks-base-300);
            }
        }
    }

    .label {
        font-size: 1.4rem;
        font-weight: 500;
        line-height: 1.2;
        color: var(--bricks-base-300);
        transition: color var(--default-transition);

        &._left {
            margin-right: 1.6rem;
            color: var(--bricks-base-300);
        }

        &._right {
            margin-left: 1.6rem;
        }
    }

    .core {
        position: relative;
        flex-shrink: 0;
        width: 3.6rem;
        height: 2rem;
        border-radius: 10rem;
        background-color: var(--bricks-base-300);
        transition: background-color var(--default-transition);

        &:after {
            content: '';
            position: absolute;
            width: 1.4rem;
            height: 1.4rem;
            border-radius: 50%;
            background-color: var(--bricks-base-0);
            transform: translate(0.2rem, 0.2rem);
            transition: transform var(--default-transition);
            box-shadow: var(--shadow-sm);
            will-change: left;
        }
    }

    &._active .label._left {
        color: var(--bricks-base-400);
    }

    &._active .label._right {
        color: var(--bricks-base-900);
    }

    &._active .core {
        background-color: var(--bricks-primary-500);

        &:after {
            transform: translate(1.8rem, 0.2rem);
        }
    }

    &._disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &:hover:not(._disabled) {
        opacity: 0.7;
    }

    &._small {
        .core {
            width: 2.8rem;
            height: 1.4rem;

            &:after {
                width: 1rem;
                height: 1rem;
                transform: translate(0.2rem, 0.2rem);
            }
        }

        &._active {
            .core {
                &:after {
                    transform: translate(1.6rem, 0.2rem);
                }
            }
        }

        .label {
            &._left {
                margin-right: 1.2rem;
            }

            &._right {
                margin-left: 1.2rem;
            }
        }
    }
}
</style>
