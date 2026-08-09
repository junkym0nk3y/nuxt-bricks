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
    type?: 'text' | 'number' | 'slug' | 'password';
    required?: boolean;
    rules?: string;
    maxLength?: number;
    /** Значение атрибута autocomplete нативного input (дефолт: 'off') */
    autocomplete?: string;
    min?: number;
    max?: number;
    step?: number;
    /** Суффикс единицы измерения (например, 'rem', 'px') */
    unit?: string;
    /** Кнопка-крестик очистки при непустом значении */
    clearable?: boolean;
    /** Кнопка показа пароля; учитывается только при type="password" */
    revealable?: boolean;
    /**
     * Счётчик `длина/maxLength` в строке лейбла. По умолчанию выключен: у
     * `maxLength` есть дефолт, и иначе счётчик появился бы у каждого поля кита.
     */
    showCounter?: boolean;
    /** Внешняя ошибка (vee-validate, сервер); приоритетнее внутренней валидации */
    errorMessage?: string | null;
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
    type: 'text' | 'number' | 'password';
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
    isPasswordVisible: import('vue').Ref<boolean>;
    showRevealButton: import('vue').ComputedRef<boolean>;
    handleInput: (event: Event) => void;
    handleBlur: (event: FocusEvent) => void;
    handleClear: () => void;
    handleStep: (direction: 1 | -1) => void;
    togglePasswordVisibility: () => void;
}

export interface IBricksFieldErrorProps {
    /** Текст ошибки; null/пустая строка — ошибка скрыта (с fade-транзишеном) */
    message?: string | null;
}

export interface IBricksTextareaProps {
    value: string | null | undefined;
    label?: string;
    disabled?: boolean;
    placeholder?: string;
    maxLength?: number;
    rows?: number;
    /** Внешняя ошибка (vee-validate и т.п.) — компонент сам не валидирует */
    errorMessage?: string | null;
}

export interface IBricksTextareaEmits {
    'update:value': [value: string];
    blur: [event: FocusEvent];
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

export interface IBricksTagsEditorProps {
    modelValue?: string[];
    placeholder?: string;
    disabled?: boolean;
    /**
     * Имя поля для скринридера. Своего лейбла у редактора нет (подпись рисует
     * вызывающий), а плейсхолдер исчезает с появлением первого чипа — без этого
     * поле остаётся безымянным.
     */
    ariaLabel?: string;
    /**
     * Предел длины СКЛЕЕННОГО значения (теги через `TAGS_SEPARATOR`), а не числа
     * тегов: строкой оно и хранится. Тег, который в предел не влезает, редактор
     * не принимает и показывает отказ.
     */
    maxLength?: number;
    /** Внешняя ошибка (vee-validate, сервер) — приоритетнее внутреннего отказа */
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
