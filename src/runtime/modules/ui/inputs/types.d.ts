import type { TBrickDemoValues } from '../../common/types/index';
import type { IBrickUiCommonProp } from '../types/common';

export interface IBricksSelectProps {
    specs: IBrickUiCommonProp[];
    facets: TBrickDemoValues[];
    value: TBrickDemoValues;
    disabled?: boolean;
    /**
     * Accessible name of the field. The only way to label the select: attribute
     * inheritance is disabled on it and the root is not a DOM node, so an
     * `aria-label` from the outside never reaches the trigger. Without a name a
     * screen reader reads only the current value of the field ("Editor"), but
     * not what the field is.
     */
    ariaLabel?: string;
}

export interface IBricksSelectEmits {
    'update:value': [value: TBrickDemoValues | null];
}

export interface IBricksInputProps {
    value: string | number | boolean | null | undefined;
    label?: string;
    /**
     * Accessible name of the field when there is no label in either `label` or
     * `placeholder`. Needed by fields labeled from the outside by the caller's
     * own markup: without it a screen reader reads only the value of the field,
     * but not what the field is (a file address rather than just a string).
     */
    ariaLabel?: string;
    disabled?: boolean;
    placeholder?: string;
    type?: 'text' | 'number' | 'slug' | 'password';
    /**
     * Read-only value — unlike `disabled`, the field stays at full contrast,
     * focusable and copyable.
     *
     * The difference in meaning: `disabled` says "not applicable right now" and
     * dims the field to half opacity, while read-only says "this value can be
     * read and copied, but not changed". The login in the profile is exactly
     * that: it is shown so that a person can see it.
     */
    readonly?: boolean;
    required?: boolean;
    rules?: string;
    maxLength?: number;
    /** Value of the native input's autocomplete attribute (default: 'off') */
    autocomplete?: string;
    min?: number;
    max?: number;
    step?: number;
    /** Unit suffix (for example, 'rem', 'px') */
    unit?: string;
    /** Clear button shown while the value is non-empty */
    clearable?: boolean;
    /** Reveal-password button; honored only when type="password" */
    revealable?: boolean;
    /**
     * A `length/maxLength` counter in the label row. Off by default: `maxLength`
     * has a default of its own, and otherwise the counter would show up on
     * every field of the kit.
     */
    showCounter?: boolean;
    /** External error (vee-validate, server); wins over internal validation */
    errorMessage?: string | null;
}

export interface IBricksInputEmits {
    'update:value': [value: string];
    'validation-state': [payload: { valid: boolean; message: string | null }];
}

/** The emit function of BricksInput (to be passed into the composable) */
export interface IBricksInputEmitFn {
    (event: 'update:value', value: string): void;
    (event: 'validation-state', payload: { valid: boolean; message: string | null }): void;
}

/** Native input attributes assembled by the useBricksInput composable */
export interface IBricksInputNativeAttributes {
    type: 'text' | 'number' | 'password';
    autocomplete: string;
    placeholder: string;
    disabled: boolean;
    readonly: boolean;
    maxlength: number | undefined;
    inputmode: 'decimal' | 'text';
    min: number | undefined;
    max: number | undefined;
    step: number | undefined;
    'aria-label': string | undefined;
    'aria-invalid': boolean;
}

export interface IUseBricksInputReturn {
    innerValue: import('vue').Ref<string>;
    errorMessage: import('vue').Ref<string | null>;
    inputAttributes: import('vue').ComputedRef<IBricksInputNativeAttributes>;
    showStepper: import('vue').ComputedRef<boolean>;
    isPasswordVisible: import('vue').Ref<boolean>;
    showRevealButton: import('vue').ComputedRef<boolean>;
    handleInput: (event: Event) => void;
    handleBlur: (event: FocusEvent) => void;
    handleClear: () => void;
    handleStep: (direction: 1 | -1) => void;
    togglePasswordVisibility: () => void;
}

export interface IBricksFieldErrorProps {
    /** Error text; null or empty hides the error (with a fade transition) */
    message?: string | null;
}

export interface IBricksTextareaProps {
    value: string | null | undefined;
    label?: string;
    disabled?: boolean;
    placeholder?: string;
    maxLength?: number;
    rows?: number;
    /** External error (vee-validate and the like); the component does not validate */
    errorMessage?: string | null;
}

export interface IBricksTextareaEmits {
    'update:value': [value: string];
    blur: [event: FocusEvent];
}

export interface IBricksSwitchProps {
    value: string | boolean;
    /**
     * Value the switch stands for when it is on. Defaults to `true`, and the pair of
     * defaults has to stay `true`/`false`: with both of them `false` the switch reads
     * as active on `value === false` and emits `false` from either side, that is, it
     * cannot report being turned on at all.
     */
    trueValue?: string | boolean;
    /** Value the switch stands for when it is off. */
    falseValue?: string | boolean;
    disabled?: boolean;
    trueLabel?: string;
    falseLabel?: string;
    size?: 'medium' | 'small';
}

export interface IBricksSwitchEmits {
    'update:value': [value: boolean | string];
}

export interface IBricksTagsEditorProps {
    modelValue?: string[];
    placeholder?: string;
    disabled?: boolean;
    /**
     * Field name for a screen reader. The editor has no label of its own (the
     * caption is drawn by the caller), and the placeholder disappears as soon as
     * the first chip appears — without this the field stays nameless.
     */
    ariaLabel?: string;
    /**
     * Length limit of the JOINED value (tags separated by `TAGS_SEPARATOR`),
     * not of the number of tags: a string is how it is stored. A tag that does
     * not fit within the limit is rejected by the editor, which shows a refusal.
     */
    maxLength?: number;
    /** External error (vee-validate, server); wins over an internal refusal */
    errorMessage?: string | null;
}

export interface IBricksTagsEditorEmits {
    'update:modelValue': [value: string[]];
}

export interface IBricksHexInputProps {
    value: string;
    disabled?: boolean;
}

export interface IBricksHexInputEmits {
    'update:value': [value: string];
    change: [value: string];
}

export interface IBricksSearchInputProps {
    value: string;
    placeholder?: string;
    disabled?: boolean;
}

export interface IBricksSearchInputEmits {
    'update:value': [value: string];
}

export interface IBricksSliderProps {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    /**
     * Accessible name of the thumb: the track has no caption of its own (the
     * caller draws it), and without a name the thumb reads as a nameless field.
     *
     * Not `ariaLabel`: a prop of that name would have to be written in camelCase
     * in the template — the compiler treats `:aria-label` as a native attribute
     * rather than as a prop, and the required prop would have stayed unfilled
     * (the same reason as for the tab bar's `groupLabel`).
     */
    label: string;
}

export interface IBricksSliderEmits {
    'update:value': [value: number];
}
