// #region Imports
// Types
import type { IBricksInputProps, IBricksInputEmitFn, IUseBricksInputReturn } from '../types.d.ts';

// Utils
import {
    normalizeIncomingValue,
    sanitizeUserInput,
    roundToStep,
    clampToRange,
} from '../utils/bricksInput';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// VeeValidate
import { validate } from 'vee-validate';
// #endregion

/**
 * BricksInput logic: value, sanitization, VeeValidate validation, clamping on
 * blur and the custom stepper of a number input.
 *
 * @param props - Component props (after withDefaults).
 * @param emit - Component emit function.
 * @returns State, native input attributes and handlers.
 */
export function useBricksInput(
    props: IBricksInputProps,
    emit: IBricksInputEmitFn
): IUseBricksInputReturn {
    // #region Data
    const { t } = useI18n();
    const innerValue = ref<string>(normalizeIncomingValue(props.value));
    const errorMessage = ref<string | null>(null);
    const isPasswordVisible = ref<boolean>(false);
    // #endregion

    // #region Computed
    const nativeType = computed<'text' | 'number' | 'password'>(() => {
        if (props.type === 'password') {
            return isPasswordVisible.value ? 'text' : 'password';
        }

        if (props.type === 'number') {
            return 'number';
        }

        return 'text';
    });

    const placeholderText = computed(() => props.placeholder ?? '');

    const inputAttributes = computed(() => ({
        type: nativeType.value,
        autocomplete: props.autocomplete ?? 'off',
        placeholder: placeholderText.value,
        disabled: Boolean(props.disabled),
        readonly: Boolean(props.readonly),
        maxlength: nativeType.value !== 'number' ? props.maxLength : undefined,
        inputmode: props.type === 'number' ? ('decimal' as const) : ('text' as const),
        min: props.type === 'number' ? props.min : undefined,
        max: props.type === 'number' ? props.max : undefined,
        step: props.type === 'number' ? props.step : undefined,
        'aria-label': props.ariaLabel || props.label || placeholderText.value || undefined,
        'aria-invalid': Boolean(errorMessage.value),
    }));

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

    // An empty field has nothing to hide, and on a disabled one the button would
    // be dead: `_disabled` kills pointer-events for the whole component.
    const showRevealButton = computed(
        () =>
            props.type === 'password' &&
            props.revealable !== false &&
            !props.disabled &&
            innerValue.value.length > 0
    );
    // #endregion

    // #region Methods
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
     * @param target - Optional HTML input to sync the sanitized value to.
     */
    async function updateValue(nextValue: string, target?: HTMLInputElement): Promise<void> {
        const sanitised = sanitizeUserInput(nextValue, props.type, props.min);
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
                const clamped = clampToRange(roundToStep(parsed, step), props.min, props.max);

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
     * Clears the value (the clear button shown when clearable).
     */
    function handleClear(): void {
        updateValue('');
    }

    /**
     * Toggles showing the password as plain text.
     */
    function togglePasswordVisibility(): void {
        isPasswordVisible.value = !isPasswordVisible.value;
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
        const next = clampToRange(
            roundToStep(current + step * direction, step),
            props.min,
            props.max
        );

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
            const normalized = normalizeIncomingValue(newValue);
            if (normalized !== innerValue.value) {
                innerValue.value = normalized;
                runValidation(normalized);
            }
        }
    );
    // #endregion

    return {
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
    };
}
