/**
 * Text Editor Area types
 */

export interface ITextEditorAreaProps {
    value?: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    toolbar?: boolean;
    minHeight?: number;
    useRichEditor?: boolean;
}

export interface ITextEditorAreaEmits {
    'update:value': [value: string];
}
