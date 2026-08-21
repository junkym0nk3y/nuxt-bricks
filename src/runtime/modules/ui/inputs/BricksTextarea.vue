<script setup lang="ts">
/**
 * @description Multiline field of the kit. Its visual shell repeats
 * `BricksInput` (`.inner` / `.native` / `.errorMessage`), so the two fields read
 * as one family in a form.
 */

// #region Imports
// Types
import type { IBricksTextareaProps, IBricksTextareaEmits } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';

// Components
import BricksFieldError from './BricksFieldError.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTextareaProps>(), {
    label: '',
    disabled: false,
    placeholder: '',
    rows: 3,
    errorMessage: null,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksTextareaEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const innerValue = computed<string>(() => String(props.value ?? ''));

const classList = computed(() => [
    {
        [$style._disabled]: Boolean(props.disabled),
        [$style._invalid]: Boolean(props.errorMessage),
    },
]);
// #endregion

// #region Methods
/**
 * Passes the input outwards.
 *
 * @param event - Native input event.
 */
function handleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    if (!target) {
        return;
    }

    emit('update:value', target.value);
}

/**
 * Passes the blur outwards (for the vee-validate touched state).
 *
 * @param event - Blur event.
 */
function handleBlur(event: FocusEvent): void {
    emit('blur', event);
}
// #endregion
</script>

<template>
    <div :class="[$style.BricksTextarea, classList]">
        <div v-if="props.label || props.maxLength" :class="$style.label">
            <div :class="$style.text">{{ props.label }}</div>
            <span v-if="props.maxLength" :class="$style.charCount">
                {{ innerValue.length }}/{{ props.maxLength }}
            </span>
        </div>

        <div :class="$style.inner">
            <textarea
                :class="$style.native"
                :value="innerValue"
                :placeholder="props.placeholder"
                :disabled="props.disabled"
                :maxlength="props.maxLength"
                :rows="props.rows"
                :aria-label="props.label || props.placeholder || undefined"
                :aria-invalid="Boolean(props.errorMessage)"
                @input="handleInput"
                @blur="handleBlur"
            ></textarea>
        </div>

        <BricksFieldError :class="$style.errorMessage" :message="props.errorMessage" />
    </div>
</template>

<style lang="scss" module>
.BricksTextarea {
    position: relative;
    width: 100%;

    &._invalid {
        .inner {
            border-color: var(--bricks-danger-600);
        }
    }

    &._disabled {
        opacity: 0.5;
        pointer-events: none;

        .inner {
            background-color: var(--bricks-base-50);
        }
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

.charCount {
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-400);
}

.inner {
    display: flex;
    padding: 0.8rem 1.2rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background-color: transparent;
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

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
    min-height: 6rem;
    padding: 0;
    border: none;
    background: transparent;
    outline: none;
    font-family: inherit;
    font-size: 1.4rem;
    line-height: 1.8rem;
    color: var(--bricks-base-900);
    resize: vertical;

    &::placeholder {
        color: var(--bricks-base-400);
    }
}

.errorMessage {
    margin-top: 0.8rem;
}
</style>
