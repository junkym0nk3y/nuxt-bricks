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

export interface ITextEditorLinkModalProps {
    isOpen: boolean;
    /** Начальное значение формы (адрес ссылки под курсором). */
    value: ITextEditorLinkValue;
    /** Есть ли ссылка в выделении — от этого зависит показ кнопки «убрать». */
    canRemove?: boolean;
    /** Слой оверлея: `nested` для вызова из развёрнутой модалки редактора. */
    layer?: TBricksModalLayer;
}

export interface ITextEditorLinkModalEmits {
    apply: [value: ITextEditorLinkValue];
    remove: [];
    close: [];
}
