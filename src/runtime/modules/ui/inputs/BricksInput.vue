<script setup lang="ts">
/**
 * @description Text field of the kit: a label row, the native input and its
 * trailing controls (clear, stepper, password reveal).
 *
 * Three geometry decisions the styles no longer explain. The native number
 * spinner is replaced with a custom stepper, whose visible glyph is `1.2rem` (as
 * in the design) while the button box is `1.2` by `1.8rem` — the taller box is
 * the click target, not the glyph. The reveal button is `1.8rem` tall, the height of the value line:
 * a taller box would stretch the field from 3.4rem to 4rem and the password field
 * would drift away from its neighbors in the form. And unlike the clear button and
 * the stepper, the reveal button is reachable from the keyboard — there is nothing
 * else to toggle the password with — so its focus ring gets an `outline` on top of
 * the kit's shared `shadow-focus`: at that moment the field itself is lit by the
 * very same glow (`:focus-within`), and one glow alone is invisible.
 */

// #region Imports
// Types
import type { IBricksInputProps, IBricksInputEmits } from './types.d.ts';

// Composables
import { useBricksInput } from './composables/useBricksInput';

// Components
import BricksFieldError from './BricksFieldError.vue';

// Vue
import { computed, useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksInputProps>(), {
    label: '',
    placeholder: '',
    disabled: false,
    readonly: false,
    type: 'text',
    required: false,
    maxLength: 120,
    rules: '',
    step: 1,
    clearable: false,
    revealable: true,
    showCounter: false,
    errorMessage: null,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksInputEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const $style = useCssModule();
const {
    innerValue,
    errorMessage,
    inputAttributes,
    showStepper,
    isPasswordVisible,
    showRevealButton,
    handleInput,
    handleBlur,
    handleClear,
    handleStep,
    togglePasswordVisibility,
} = useBricksInput(props, emit);
// #endregion

// #region Computed
/**
 * The error on screen: an external one (vee-validate, server) takes precedence
 * over the internal one.
 */
const displayedError = computed<string | null>(() => props.errorMessage || errorMessage.value);

const showCharCount = computed<boolean>(() => props.showCounter && Boolean(props.maxLength));

const classList = computed(() => [
    {
        [$style._active]: Boolean(innerValue.value),
        [$style._disabled]: Boolean(props.disabled),
        [$style._invalid]: Boolean(displayedError.value),
    },
]);
// #endregion
</script>

<template>
    <div :class="[$style.BricksInput, classList]">
        <div v-if="props.label || showCharCount" :class="$style.label">
            <div :class="$style.text">{{ props.label }}</div>
            <span v-if="showCharCount" :class="$style.charCount">
                {{ innerValue.length }}/{{ props.maxLength }}
            </span>
        </div>

        <div :class="$style.inner">
            <span v-if="$slots.prefix" :class="$style.prefix">
                <slot name="prefix"></slot>
            </span>

            <input
                v-bind="inputAttributes"
                :class="$style.native"
                :tabindex="0"
                :value="innerValue"
                :aria-invalid="Boolean(displayedError)"
                @input="handleInput"
                @blur="handleBlur"
            />

            <span v-if="props.unit" :class="$style.unitSuffix">{{ props.unit }}</span>

            <button
                v-if="props.clearable && innerValue"
                type="button"
                :class="$style.clearButton"
                tabindex="-1"
                :aria-label="t('bricks.common.clear')"
                @click="handleClear"
            >
                <BricksIcon icon="ta:outline-x" />
            </button>

            <button
                v-if="showRevealButton"
                type="button"
                :class="$style.revealButton"
                :aria-pressed="isPasswordVisible"
                :aria-label="
                    isPasswordVisible
                        ? t('bricks.common.hidePassword')
                        : t('bricks.common.showPassword')
                "
                @click="togglePasswordVisibility"
            >
                <BricksIcon :icon="isPasswordVisible ? 'ta:outline-eye-off' : 'ta:outline-eye'" />
            </button>

            <div v-if="showStepper" :class="$style.stepper">
                <button
                    type="button"
                    :class="$style.stepButton"
                    tabindex="-1"
                    :aria-label="t('bricks.common.increase')"
                    @click="handleStep(1)"
                >
                    <BricksIcon icon="ta:outline-plus" />
                </button>
                <button
                    type="button"
                    :class="$style.stepButton"
                    tabindex="-1"
                    :aria-label="t('bricks.common.decrease')"
                    @click="handleStep(-1)"
                >
                    <BricksIcon icon="ta:outline-minus" />
                </button>
            </div>
        </div>

        <BricksFieldError :class="$style.errorMessage" :message="displayedError" />
    </div>
</template>

<style lang="scss" module>
.BricksInput {
    position: relative;
    width: 100%;

    &._active {
        .inner {
            border-color: var(--bricks-base-400);
        }
    }

    &._invalid {
        .inner {
            border-color: var(--bricks-danger-600);
        }

        .native {
            color: var(--bricks-danger-600);
        }
    }

    &._disabled {
        opacity: 0.5;
        pointer-events: none;

        .inner {
            background-color: var(--bricks-base-50);
        }

        .stepper {
            pointer-events: none;
        }
    }

    .label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.8rem;
        font-size: 1.4rem;
        font-weight: 500;
        color: var(--bricks-base-600);
        pointer-events: none;

        @media (width <= 768px) {
            font-size: 1.6rem;
        }
    }
}

.charCount {
    flex-shrink: 0;
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-500);
}

.inner {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    padding: 0.8rem 1.2rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background-color: transparent;
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);
    gap: 0.8rem;

    &:hover {
        border-color: var(--bricks-base-400);
        background-color: var(--bricks-surface-raised);
    }

    &:focus-within {
        border-color: var(--bricks-primary);
        background-color: var(--bricks-surface-raised);
        box-shadow: var(--bricks-shadow-focus);
    }
}

.native {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    outline: none;
    font-size: 1.4rem;
    line-height: 1.8rem;
    color: var(--bricks-base-900);
    appearance: textfield;

    &:focus {
        outline: none;
    }

    &::placeholder {
        color: var(--bricks-base-400);
    }

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
        margin: 0;
        appearance: none;
    }
}

.prefix {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--bricks-base-400);
    pointer-events: none;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }
}

.clearButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--bricks-base-400);
    transition: color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        color: var(--bricks-base-800);
    }

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }
}

.revealButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.4rem;
    height: 1.8rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    color: var(--bricks-base-500);
    transition: color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        color: var(--bricks-base-900);
    }

    &:focus-visible {
        outline: 1px solid var(--bricks-primary);
        box-shadow: var(--bricks-shadow-focus);
        color: var(--bricks-base-900);
    }

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }
}

.unitSuffix {
    flex-shrink: 0;
    font-size: 1.2rem;
    line-height: 1.8rem;
    color: var(--bricks-base-400);
    pointer-events: none;
    user-select: none;
}

.stepper {
    display: flex;
    flex-shrink: 0;
    flex-direction: row;
    gap: 0.2rem;
    pointer-events: auto;
}

.stepButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2rem;
    height: 1.8rem;
    padding: 0;
    border: none;
    background-color: transparent;
    color: var(--bricks-base-500);
    transition: color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        color: var(--bricks-primary);
    }

    svg {
        flex-shrink: 0;
        width: 1.2rem;
        height: 1.2rem;
    }
}

.errorMessage {
    margin-top: 0.8rem;
}
</style>
