// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { ITextEditorAreaProps } from '../components/types.d.ts';
import type { ITextEditorArea } from '../types/composables';

// Vue
import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component } from 'vue';

// Utils
import { createTiptapEditor } from '../utils/createTiptapEditor';
import { insertMediaIntoEditor } from '../utils/insertMediaIntoEditor';

// Composables
import { useTextEditorLink } from './useTextEditorLink';
import { useToolbarStateSync } from './useToolbarStateSync';

// Pinia
import { useInlineEditingStore } from '../stores/inlineEditing';
// #endregion

/**
 * The logic of TextEditorArea: the TipTap editor lifecycle (lazy initialization on the
 * client, destroy on unmount), syncing props.value and props.disabled into the editor,
 * the code-view and dark-background toggles, the content and media-insert handlers.
 *
 * `props.placeholder` belongs to the fallback textarea alone. The rich editor has no
 * placeholder: showing one inside a ProseMirror document takes an extension of its own
 * (an empty paragraph is `<p><br></p>`, so neither `:empty` nor a plain attribute
 * reaches it), and a `data-placeholder` attribute was written onto the editor without
 * anything reading it — no extension, no selector in the whole tree.
 *
 * @param props - Props of TextEditorArea (the reactive defineProps object).
 * @param emit - The emit function of the component (the update:value event).
 */
export function useTextEditorArea(
    props: ITextEditorAreaProps,
    emit: (event: 'update:value', value: string) => void
): ITextEditorArea {
    const inlineEditingStore = useInlineEditingStore();

    const innerValue = ref<string>(props.value ?? '');
    const isClient = ref(false);
    const loadingError = ref<unknown | null>(null);
    const isCodeView = ref(false);
    const isDarkEditorBackground = ref(false);
    const editor = shallowRef<Editor | null>(null);
    const EditorContentComponent = shallowRef<Component | null>(null);

    const link = useTextEditorLink(editor);

    const { toolbarGroups } = useToolbarStateSync(editor, {
        isEnabled: () => props.useRichEditor !== false && isClient.value,
        onRequestLink: link.openLinkModal,
    });

    /** Switches the view between the visual mode and the source */
    function toggleCodeView(): void {
        if (props.useRichEditor === false) {
            return;
        }

        isCodeView.value = !isCodeView.value;

        if (!isCodeView.value && editor.value && editor.value.getHTML() !== innerValue.value) {
            editor.value.commands.setContent(innerValue.value, { emitUpdate: false });
        }
    }

    /** Switches the background of the visual editor between light and dark */
    function toggleEditorBackground(): void {
        isDarkEditorBackground.value = !isDarkEditorBackground.value;
    }

    /** Updates the inner value and emits the update:value event */
    function handleContentUpdate(content: string): void {
        innerValue.value = content;
        emit('update:value', content);
    }

    /** Handles input in the fallback textarea (no rich editor) */
    function handleTextareaInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        const value = target.value;
        if (editor.value && editor.value.getHTML() !== value) {
            editor.value.commands.setContent(value, { emitUpdate: false });
        }
        handleContentUpdate(value);
    }

    /** Handles a value update coming from the modal editor */
    function handleModalUpdate(value: string): void {
        handleContentUpdate(value);
        if (editor.value && editor.value.getHTML() !== value) {
            editor.value.commands.setContent(value, { emitUpdate: false });
        }
    }

    /**
     * Requests media from MediaGallery through inlineEditingStore.
     * Once something is picked, inserts the image or the video into the TipTap editor.
     */
    function handleRequestImage(): void {
        if (!editor.value) {
            return;
        }

        const ed = editor.value;
        inlineEditingStore.requestMedia((item) => insertMediaIntoEditor(ed, item));
    }

    /** Initializes the rich text editor, on the client only */
    async function initEditor(): Promise<void> {
        if (import.meta.server || props.useRichEditor === false || editor.value) {
            return;
        }

        try {
            const { editor: createdEditor, EditorContent } = await createTiptapEditor({
                content: innerValue.value,
                editable: !props.disabled,
                onUpdate: ({ editor: instance }) => {
                    const html = instance.getHTML();
                    if (html !== innerValue.value) {
                        handleContentUpdate(html);
                    }
                },
            });

            EditorContentComponent.value = EditorContent;
            editor.value = createdEditor;
            loadingError.value = null;
        } catch (error) {
            loadingError.value =
                error instanceof Error ? error : new Error('Failed to load rich text editor');
        }
    }

    watch(
        () => props.value,
        (next) => {
            if (typeof next === 'string' && next !== innerValue.value) {
                innerValue.value = next;
                if (editor.value && editor.value.getHTML() !== next) {
                    editor.value.commands.setContent(next, { emitUpdate: false });
                }
            }
        }
    );

    watch([() => props.disabled, isCodeView], ([disabled, codeView]) => {
        if (props.useRichEditor === false) {
            return;
        }
        editor.value?.setEditable(!disabled && !codeView);
    });

    onMounted(() => {
        isClient.value = true;
        initEditor();
    });

    onBeforeUnmount(() => {
        editor.value?.destroy();
    });

    return {
        innerValue,
        isClient,
        loadingError,
        isCodeView,
        isDarkEditorBackground,
        editor,
        EditorContentComponent,
        toolbarGroups,
        toggleCodeView,
        toggleEditorBackground,
        handleContentUpdate,
        handleTextareaInput,
        handleModalUpdate,
        handleRequestImage,
        link,
    };
}
