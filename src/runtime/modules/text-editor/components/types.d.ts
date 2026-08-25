/**
 * Text Editor component types
 */

import type { Editor } from '@tiptap/vue-3';
import type { TBricksModalLayer } from '../../ui/base/modal/types';
import type { ITextEditorLinkValue } from '../types/composables';

export interface ITextEditorImageFloatPopoverProps {
    editor: Editor | null;
}

export interface ITextEditorImageSizePanelProps {
    editor: Editor | null;
    activeNodeType: string | null;
}

export interface ITextEditorAreaProps {
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    toolbar?: boolean;
    minHeight?: number;
    useRichEditor?: boolean;
}

export interface ITextEditorAreaEmits {
    'update:value': [value: string];
}

export interface ITextEditorLinkModalProps {
    isOpen: boolean;
    /** Initial form value (address of the link under the cursor) */
    value: ITextEditorLinkValue;
    /** Whether the selection holds a link — decides if the "remove" button shows */
    canRemove?: boolean;
    /** Overlay layer: `nested` when opened from the expanded editor modal */
    layer?: TBricksModalLayer;
}

export interface ITextEditorLinkModalEmits {
    apply: [value: ITextEditorLinkValue];
    remove: [];
    close: [];
}
