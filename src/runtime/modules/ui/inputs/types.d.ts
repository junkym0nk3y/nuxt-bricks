import type { ILandDemoValues } from '../../common/types/index';

// Ensure all value types match component expectations
export interface ILandUiCommonProp {
    label: string;
    value: string | boolean;
    disabled?: boolean;
    placeholder?: string;
}

export interface IBricksSelectProps {
    specs: ILandUiCommonProp[];
    facets: ILandDemoValues[];
    value: ILandDemoValues;
    disabled?: boolean;
}

export interface IBricksSelectEmits {
    'update:value': [value: ILandDemoValues | null];
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

export interface IBricksTextAreaProps {
    value?: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    toolbar?: boolean;
    minHeight?: number;
    useRichEditor?: boolean;
}

export interface IBricksTextAreaEmits {
    'update:value': [value: string];
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
