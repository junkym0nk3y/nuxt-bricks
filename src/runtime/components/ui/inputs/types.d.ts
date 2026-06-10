import type { ILandDemoValues } from '../../../types.d.ts';

// Ensure all value types match component expectations
export interface ILandUiCommonProp {
    label: string;
    value: string | boolean;
    disabled?: boolean;
    placeholder?: string;
}

export interface IIdaSelectProps {
    specs: ILandUiCommonProp[];
    facets: ILandDemoValues[];
    value: ILandDemoValues;
    disabled?: boolean;
}

export interface IIdaSelectEmits {
    'update:value': [value: ILandDemoValues | null];
}

export interface IIdaInputProps {
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

export interface IIdaInputEmits {
    'update:value': [value: string];
    'validation-state': [payload: { valid: boolean; message: string | null }];
}

export interface IIdaTextAreaProps {
    value?: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    toolbar?: boolean;
    minHeight?: number;
    useRichEditor?: boolean;
}

export interface IIdaTextAreaEmits {
    'update:value': [value: string];
}

export interface IIdaSwitchProps {
    value: string | boolean;
    trueValue?: string | boolean;
    falseValue?: string | boolean;
    disabled?: boolean;
    trueLabel?: string;
    falseLabel?: string;
    size?: 'medium' | 'small';
}

export interface IIdaSwitchEmits {
    'update:value': [value: boolean | string];
}

export interface IIdaHexInputProps {
    value: string;
    disabled?: boolean;
}

export interface IIdaHexInputEmits {
    'update:value': [value: string];
    change: [value: string];
}
