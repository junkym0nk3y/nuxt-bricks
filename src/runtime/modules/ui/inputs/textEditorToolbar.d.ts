// #region Imports
import type { Editor } from '@tiptap/vue-3';
import type { Ref } from 'vue';
// #endregion

export interface IToolbarButton {
    label?: string;
    icon?: string;
    title: string;
    run: () => void;
    isActive: () => boolean;
}

export interface IToolbarSelect {
    type: 'select';
    title: string;
    label?: string;
    icon?: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
}

export interface IToolbarEditableSelect {
    type: 'editable-select';
    title: string;
    label?: string;
    icon?: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
    customInputPlaceholder?: string;
    /** Transforms the entered value before it is passed to onChange */
    transformInput?: (raw: string) => string;
    /** Validates the entered value (true means valid) */
    validateInput?: (raw: string) => boolean;
    /** Compact trigger: icon only, the current value is not shown */
    hideValue?: boolean;
}

export interface IToolbarColorPicker {
    type: 'color';
    title: string;
    icon?: string;
    value: string;
    onChange: (value: string) => void;
}

export type TToolbarItem =
    | IToolbarButton
    | IToolbarSelect
    | IToolbarEditableSelect
    | IToolbarColorPicker;

export interface IToolbarGroup {
    name: string;
    items: TToolbarItem[];
}

export interface IToolbarStateRefs {
    currentFontSize: Ref<string>;
    currentFontWeight: Ref<string>;
    currentColor: Ref<string>;
    currentFontFamily: Ref<string>;
    currentLineHeight: Ref<string>;
    currentLetterSpacing: Ref<string>;
}

export interface ITextEditorToolbarConfigParams extends IToolbarStateRefs {
    editor: Editor;
    availableFonts: string[];
    /**
     * Opens the link modal for the current selection. The toolbar configurator is
     * a pure function with no access to the UI, so it hands out the link button
     * only to those surfaces that have mounted such a modal.
     */
    onRequestLink?: () => void;
}

export interface ITextEditorToolbar {
    createToolbarConfig: (params: ITextEditorToolbarConfigParams) => IToolbarGroup[];
    syncToolbarState: (editor: Editor, refs: IToolbarStateRefs) => void;
}

declare module '#app' {
    interface NuxtApp {
        $textEditorToolbar: ITextEditorToolbar;
    }
}

declare module 'nuxt/app' {
    interface NuxtApp {
        $textEditorToolbar: ITextEditorToolbar;
    }
}

declare module 'vue' {
    interface ComponentCustomProperties {
        $textEditorToolbar: ITextEditorToolbar;
    }
}
