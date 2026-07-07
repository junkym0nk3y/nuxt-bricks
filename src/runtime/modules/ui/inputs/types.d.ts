import type { TBrickDemoValues } from '../../common/types/index';
import type { IBrickUiCommonProp } from '../types/common';

export interface IBricksSelectProps {
    specs: IBrickUiCommonProp[];
    facets: TBrickDemoValues[];
    value: TBrickDemoValues;
    disabled?: boolean;
}

export interface IBricksSelectEmits {
    'update:value': [value: TBrickDemoValues | null];
}

export interface IBricksInputProps {
    value: string | number | boolean | null | undefined;
    label?: string;
    disabled?: boolean;
    placeholder?: string;
    type?: 'text' | 'number' | 'slug';
    required?: boolean;
    rules?: string;
    maxLength?: number;
    min?: number;
    max?: number;
    step?: number;
    /** Суффикс единицы измерения (например, 'rem', 'px') */
    unit?: string;
}

export interface IBricksInputEmits {
    'update:value': [value: string];
    'validation-state': [payload: { valid: boolean; message: string | null }];
}

/** Функция emit компонента BricksInput (для передачи в композабл). */
export interface IBricksInputEmitFn {
    (event: 'update:value', value: string): void;
    (event: 'validation-state', payload: { valid: boolean; message: string | null }): void;
}

/** Атрибуты нативного input, собранные композаблом useBricksInput. */
export interface IBricksInputNativeAttributes {
    type: 'text' | 'number';
    autocomplete: string;
    placeholder: string;
    disabled: boolean;
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
    handleInput: (event: Event) => void;
    handleBlur: (event: FocusEvent) => void;
    handleStep: (direction: 1 | -1) => void;
}

export interface IBricksSwitchProps {
    value: string | boolean;
    trueValue?: string | boolean;
    falseValue?: string | boolean;
    disabled?: boolean;
    trueLabel?: string;
    falseLabel?: string;
    size?: 'medium' | 'small';
}

export interface IBricksSwitchEmits {
    'update:value': [value: boolean | string];
}

export interface IBricksHexInputProps {
    value: string;
    disabled?: boolean;
}

export interface IBricksHexInputEmits {
    'update:value': [value: string];
    change: [value: string];
}
