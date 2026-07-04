<script setup lang="ts">
// #region Imports
// Types
import type { IBricksInputProps, IBricksInputEmits } from './types.d.ts';

// Vue
import { computed, ref, useCssModule, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// VeeValidate
import { validate } from 'vee-validate';
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
const innerValue = ref<string>(normalizeIncomingValue(props.value));
const errorMessage = ref<string | null>(null);
// #endregion

// #region Computed
const nativeType = computed<'text' | 'number'>(() => (props.type === 'number' ? 'number' : 'text'));

const placeholderText = computed(() => props.placeholder);

const inputAttributes = computed(() => ({
    type: nativeType.value,
    autocomplete: 'off',
    placeholder: placeholderText.value,
    disabled: props.disabled,
    maxlength: nativeType.value === 'text' ? props.maxLength : undefined,
    inputmode: props.type === 'number' ? ('decimal' as const) : ('text' as const),
    min: props.type === 'number' ? props.min : undefined,
    max: props.type === 'number' ? props.max : undefined,
    step: props.type === 'number' ? props.step : undefined,
    'aria-label': props.label || placeholderText.value || undefined,
    'aria-invalid': Boolean(errorMessage.value),
}));

const classList = computed(() => [
    {
        [$style._active]: Boolean(innerValue.value),
        [$style._disabled]: Boolean(props.disabled),
        [$style._invalid]: Boolean(errorMessage.value),
    },
]);

const validationRules = computed(() => {
    if (props.rules) {
        return props.rules;
    }

    const rules: string[] = [];

    if (props.required) {
        rules.push('required');
    }

    if (props.type === 'slug') {
        rules.push('slug');
    }

    if (props.type === 'number') {
        rules.push('decimal');
    }

    if (props.maxLength && props.type !== 'number') {
        rules.push(`max:${props.maxLength}`);
    }

    return rules.join('|');
});

const showStepper = computed(() => props.type === 'number' && !props.disabled);
// #endregion

// #region Methods
/**
 * Normalizes incoming prop values to an editable string.
 *
 * @param value - External value.
 * @returns String representation of the value.
 */
function normalizeIncomingValue(value: IBricksInputProps['value']): string {
    if (value === null || typeof value === 'undefined') {
        return '';
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    return String(value);
}

/**
 * Sanitises user input according to the input type.
 *
 * @param value - Raw user input.
 * @returns Sanitised string.
 */
function sanitizeUserInput(value: string): string {
    if (props.type === 'slug') {
        return value
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-+/g, '');
    }

    if (props.type === 'number') {
        const sanitized = value.replace(/[^\d.-]/g, '');
        if (!sanitized) {
            return '';
        }

        const minNonNegative = typeof props.min === 'number' && props.min >= 0;
        const hasLeadingMinus = sanitized.startsWith('-') && !minNonNegative;
        const withoutMinus = sanitized.replace(/-/g, '');
        const [integerPartRaw, ...fractionParts] = withoutMinus.split('.');
        const integerPart = integerPartRaw ?? '';
        const fractionPart = fractionParts.join('');

        let normalized = integerPart;
        if (fractionPart.length > 0) {
            normalized += `.${fractionPart}`;
        }

        if (hasLeadingMinus) {
            normalized = normalized ? `-${normalized}` : '-';
        }

        return normalized;
    }

    return value;
}

/**
 * Validates value using VeeValidate rules set.
 *
 * @param value - Value to validate.
 */
async function runValidation(value: string): Promise<void> {
    const intermediateNumberValues = ['', '-', '.', '-.'];
    if (
        !props.required &&
        props.type === 'number' &&
        intermediateNumberValues.includes(value.trim())
    ) {
        errorMessage.value = null;
        emit('validation-state', { valid: true, message: null });
        return;
    }

    if (!validationRules.value) {
        errorMessage.value = null;
        emit('validation-state', { valid: true, message: null });
        return;
    }

    const result = await validate(value, validationRules.value, {
        name: props.label || placeholderText.value || t('bricks.validation.fieldFallback'),
    });

    errorMessage.value = result.errors[0] || null;
    emit('validation-state', { valid: !errorMessage.value, message: errorMessage.value });
}

/**
 * Updates current value and triggers validation.
 *
 * @param nextValue - Value to set.
 * @param target - Optional HTML input to sync sanitised value.
 */
async function updateValue(nextValue: string, target?: HTMLInputElement): Promise<void> {
    const sanitised = sanitizeUserInput(nextValue);
    innerValue.value = sanitised;

    if (target && target.value !== sanitised) {
        target.value = sanitised;
    }

    emit('update:value', sanitised);
    await runValidation(sanitised);
}

/**
 * Handles input event from native field.
 *
 * @param event - Native input event.
 */
function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
        return;
    }

    updateValue(target.value, target);
}

/**
 * Validates current value when field loses focus.
 * For number inputs, clamps value to min/max range.
 *
 * @param event - Blur event.
 */
function handleBlur(event: FocusEvent): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
        return;
    }

    if (props.type === 'number' && innerValue.value.trim() !== '') {
        const parsed = Number(innerValue.value);
        if (Number.isFinite(parsed)) {
            const step = props.step ?? 1;
            let clamped = roundToStep(parsed, step);

            if (typeof props.min === 'number') {
                clamped = Math.max(props.min, clamped);
            }
            if (typeof props.max === 'number') {
                clamped = Math.min(props.max, clamped);
            }

            if (clamped !== parsed) {
                const formatted = String(clamped);
                innerValue.value = formatted;
                if (target.value !== formatted) {
                    target.value = formatted;
                }
                emit('update:value', formatted);
            }
        }
    }

    runValidation(target.value);
}

/**
 * Округляет число до заданного шага для устранения floating point ошибок.
 *
 * @param value - Числовое значение.
 * @param step - Шаг округления.
 * @returns Округлённое значение.
 */
function roundToStep(value: number, step: number): number {
    const precision = Math.max(0, Math.ceil(-Math.log10(step)));
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

/**
 * Adjusts numeric value by configured step.
 *
 * @param direction - Increment direction (1 for up, -1 for down).
 */
function handleStep(direction: 1 | -1): void {
    const parsed = Number(innerValue.value);
    const current = Number.isFinite(parsed) ? parsed : 0;
    const step = props.step ?? 1;
    const delta = step * direction;
    let next = roundToStep(current + delta, step);

    if (typeof props.min === 'number') {
        next = Math.max(props.min, next);
    }

    if (typeof props.max === 'number') {
        next = Math.min(props.max, next);
    }

    const formatted = String(next);
    innerValue.value = formatted;
    emit('update:value', formatted);
    runValidation(formatted);
}
// #endregion

// #region Watchers
watch(
    () => props.value,
    (newValue) => {
        const normalised = normalizeIncomingValue(newValue);
        if (normalised !== innerValue.value) {
            innerValue.value = normalised;
            runValidation(normalised);
        }
    }
);
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
                    <BricksIcon icon="ph:plus" />
                </button>
                <button
                    type="button"
                    :class="$style.stepButton"
                    tabindex="-1"
                    :aria-label="t('bricks.common.decrease')"
                    @click="handleStep(-1)"
                >
                    <BricksIcon icon="ph:minus" />
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
    padding: 0.8rem 1.2rem;
    border: none;
    background: transparent;
    outline: none;
    font-size: 1.4rem;
    line-height: 1.8rem;
    color: var(--bricks-base-900);

    &:focus {
        outline: none;
    }

    &::placeholder {
        color: var(--bricks-base-400);
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
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 0.4rem;
    border: none;
    background-color: transparent;
    color: var(--bricks-base-500);
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    &:hover {
        background-color: var(--bricks-primary-50);
        color: var(--bricks-primary);
    }

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }
}

.errorMessage {
    margin: 0.4rem 0 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-danger-600);
    opacity: 0;
    transition: opacity var(--default-transition);
}
</style>
