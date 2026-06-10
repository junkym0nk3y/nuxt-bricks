export interface IIdaCheckboxProps {
    value: boolean;
    disabled?: boolean;
    label?: string;
    size?: 'sm' | 'md';
    name?: string;
}

export interface IIdaCheckboxEmits {
    'update:value': [value: boolean];
    focus: [event: FocusEvent];
    blur: [event: FocusEvent];
    keydown: [event: KeyboardEvent];
}
