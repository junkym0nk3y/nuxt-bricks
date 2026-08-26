/**
 * Types of the composables of the text-editor domain.
 */

import type { Editor } from '@tiptap/vue-3';
import type { Component, ComputedRef, MaybeRefOrGetter, Ref, ShallowRef } from 'vue';

import type { TInlineEditingPropType } from '../../common/types/inlineEditing';
import type { IToolbarGroup, IToolbarStateRefs } from '../../ui/inputs/textEditorToolbar';

// #region useInlineEditor
/**
 * Options of the useInlineEditor composable: the editable property of a schema component.
 */
export interface IUseInlineEditorOptions {
    componentId: string;
    propName: string;
    propType: TInlineEditingPropType;
}

/**
 * Return value of the useInlineEditor composable.
 */
export interface IUseInlineEditorReturn {
    editor: ShallowRef<Editor | null>;
    editorContent: ShallowRef<Component | null>;
    isActive: ComputedRef<boolean>;
    initEditor: () => Promise<void>;
    saveAndStop: () => void;
    destroy: () => void;
}
// #endregion

// #region useTextEditorArea
/**
 * Return value of the useTextEditorArea composable.
 */
export interface ITextEditorArea {
    /** Current content value (HTML) */
    innerValue: Ref<string>;
    /** true after mount — the editor exists on the client only */
    isClient: Ref<boolean>;
    /** Loading error of the rich editor (falls back to a textarea) */
    loadingError: Ref<unknown | null>;
    /** HTML source view instead of the visual editor */
    isCodeView: Ref<boolean>;
    /** Dark background of the input area */
    isDarkEditorBackground: Ref<boolean>;
    /** TipTap editor instance (null until it is initialized) */
    editor: ShallowRef<Editor | null>;
    /** The EditorContent component from @tiptap/vue-3 (lazy) */
    EditorContentComponent: ShallowRef<Component | null>;
    /** Config of the toolbar groups */
    toolbarGroups: ComputedRef<IToolbarGroup[]>;
    /** Switches between the visual mode and the source */
    toggleCodeView: () => void;
    /** Switches the editor background between light and dark */
    toggleEditorBackground: () => void;
    /** Updates the value and emits update:value */
    handleContentUpdate: (content: string) => void;
    /** Handles input in the fallback textarea */
    handleTextareaInput: (event: Event) => void;
    /** Handles a value update coming from the modal editor */
    handleModalUpdate: (value: string) => void;
    /** Requests media from MediaGallery and inserts it into the editor */
    handleRequestImage: () => void;
    /** State and operations of the link modal of this editor */
    link: ITextEditorLink;
}
// #endregion

// #region useToolbarStateSync
/**
 * Options of the useToolbarStateSync composable.
 */
export interface IToolbarStateSyncOptions {
    /** Extra condition for showing the toolbar (false gives an empty list of groups) */
    isEnabled?: MaybeRefOrGetter<boolean>;
    /** Opens the link modal; without it the toolbar has no link button */
    onRequestLink?: () => void;
}

/**
 * Return value of the useToolbarStateSync composable.
 */
export interface IToolbarStateSync {
    /** Refs of the current font/color/spacing values for the toolbar selects */
    toolbarState: IToolbarStateRefs;
    /** Config of the toolbar groups (empty with no editor or with isEnabled = false) */
    toolbarGroups: ComputedRef<IToolbarGroup[]>;
    /** Resets the toolbar state to the defaults (say, when the edited property changes) */
    resetToolbarState: () => void;
}
// #endregion

// #region useTextEditorLink
/**
 * Value of the link form: the address and the open-in-a-new-tab flag.
 */
export interface ITextEditorLinkValue {
    href: string;
    openInNewTab: boolean;
}

/**
 * Return value of the useTextEditorLink composable.
 */
export interface ITextEditorLink {
    /** Whether the link modal is open */
    isLinkModalOpen: Ref<boolean>;
    /** Initial form value: address and tab flag of the link currently under the cursor */
    linkValue: Ref<ITextEditorLinkValue>;
    /** Whether the current selection holds a link — decides on the "remove" button */
    hasLinkAtSelection: Ref<boolean>;
    /** Opens the modal, prefilling the attributes of the link under the cursor */
    openLinkModal: () => void;
    /** Closes the modal and returns the focus to the editor */
    closeLinkModal: () => void;
    /** Applies the link to the selection (or inserts the address as text) */
    applyLink: (value: ITextEditorLinkValue) => void;
    /** Removes the link from the selection as a whole */
    removeLink: () => void;
}
// #endregion
