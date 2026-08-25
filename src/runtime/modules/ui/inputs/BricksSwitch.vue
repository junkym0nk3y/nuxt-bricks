<script setup lang="ts">
/**
 * @description Toggle switch on top of the reka switch: a track plus a knob and
 * optional captions.
 *
 * The knob has `top`/`left` set explicitly. Without them its position depends on
 * the static position of `::after`, which the UA `text-align: center` on a
 * `button` shifts on pages without a global reset — the dashboard, for instance.
 * The pair `top: 50%` plus `translateY(-50%)` centers the knob vertically at any
 * track height, and the track-to-knob gap is not a multiple of `0.2rem`.
 */

/**
 * The caption of the switch is text that says what the control does, so its color
 * clears AA for small text: the pale tone it used to carry reached 1.41 against
 * white — visible to nobody who needs contrast. The dimmed look of an inactive side
 * survives through the secondary text role (`--bricks-text-muted`), which is dimmer than
 * the active caption and still readable; the pale step it used to carry was not.
 */

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
    trueValue: true,
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
    transition: opacity var(--bricks-default-transition);
    cursor: pointer;
    user-select: none;

    &._oneSide {
        &._active .label._left {
            color: var(--bricks-base-500);
        }

        .label {
            &._left {
                color: var(--bricks-base-500);
            }
        }
    }

    .label {
        font-size: 1.4rem;
        font-weight: 500;
        line-height: 1.2;
        color: var(--bricks-base-600);
        transition: color var(--bricks-default-transition);

        &._left {
            margin-right: 1.6rem;
            color: var(--bricks-base-500);
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
        transition: background-color var(--bricks-default-transition);

        &:after {
            content: '';
            position: absolute;
            top: 50%;
            left: 0;
            width: 1.4rem;
            height: 1.4rem;
            border-radius: 50%;
            background-color: var(--bricks-base-0);
            transform: translate(0.2rem, -50%);
            transition: transform var(--bricks-default-transition);
            box-shadow: var(--bricks-shadow-sm);
            will-change: transform;
        }
    }

    &._active .label._left {
        color: var(--bricks-text-muted);
    }

    &._active .label._right {
        color: var(--bricks-base-900);
    }

    &._active .core {
        background-color: var(--bricks-primary);

        &:after {
            transform: translate(2rem, -50%);
        }
    }

    &._disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &:hover:not(._disabled) {
        opacity: 0.7;
    }

    &:focus-visible .core {
        box-shadow: var(--bricks-shadow-focus);
    }

    &._small {
        .core {
            width: 2.8rem;
            height: 1.4rem;

            &:after {
                width: 1rem;
                height: 1rem;
                transform: translate(0.2rem, -50%);
            }
        }

        &._active {
            .core {
                &:after {
                    transform: translate(1.6rem, -50%);
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
