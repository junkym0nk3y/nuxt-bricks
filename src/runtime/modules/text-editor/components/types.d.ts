/**
 * Text Editor component types
 */

import type { Editor } from '@tiptap/vue-3';

export interface ITextEditorImageFloatPopoverProps {
    editor: Editor | null;
}

export interface ITextEditorImageSizePanelProps {
    editor: Editor | null;
    activeNodeType: string | null;
}

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
