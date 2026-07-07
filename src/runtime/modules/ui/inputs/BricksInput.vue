<script setup lang="ts">
// #region Imports
// Types
import type { IBricksInputProps, IBricksInputEmits } from './types.d.ts';

// Composables
import { useBricksInput } from './composables/useBricksInput';

// Vue
import { computed, useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksInputProps>(), {
    label: '',
    placeholder: '',
    disabled: false,
    type: 'text',
    required: false,
    maxLength: 120,
    rules: '',
    step: 1,
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
    handleInput,
    handleBlur,
    handleStep,
} = useBricksInput(props, emit);
// #endregion

// #region Computed
const classList = computed(() => [
    {
        [$style._active]: Boolean(innerValue.value),
        [$style._disabled]: Boolean(props.disabled),
        [$style._invalid]: Boolean(errorMessage.value),
    },
]);
// #endregion
</script>

<template>
    <div :class="[$style.BricksInput, classList]">
        <div v-if="props.label" :class="$style.label">
            <div :class="$style.text">{{ props.label }}</div>
        </div>

        <div :class="$style.inner">
            <input
                v-bind="inputAttributes"
                :class="$style.native"
                :tabindex="0"
                :value="innerValue"
                @input="handleInput"
                @blur="handleBlur"
            />

            <span v-if="props.unit" :class="$style.unitSuffix">{{ props.unit }}</span>

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

        <Transition mode="out-in" name="library-fade-fast">
            <p v-if="errorMessage" :class="$style.errorMessage">{{ errorMessage }}</p>
        </Transition>
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

        .errorMessage {
            opacity: 1;
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

.inner {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    padding: 0.8rem 1.2rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    transition:
        border-color var(--default-transition),
        box-shadow var(--default-transition);
    gap: 0.8rem;

    &:hover {
        border-color: var(--bricks-base-400);
    }

    &:focus-within {
        border-color: var(--bricks-primary);
        box-shadow: var(--shadow-focus);
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

    // Нативный спиннер number-инпута заменён кастомным степпером
    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
        margin: 0;
        appearance: none;
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

// Видимый глиф 1.2rem (как в макете), высота 1.8rem — увеличенная зона клика
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
    transition: color var(--default-transition);
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
    margin: 0.8rem 0 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-danger-600);
    opacity: 0;
    transition: opacity var(--default-transition);
}
</style>
