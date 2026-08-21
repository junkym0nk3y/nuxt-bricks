// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IInlineContentSegment } from '../../common/types/content';
import type { IInlineEditorHost } from '../../common/types/inlineEditing';
import type { IUseInlineEditorOptions, IUseInlineEditorReturn } from '../types/composables';

// Vue
import { shallowRef, computed, inject, watch, onBeforeUnmount, type Component } from 'vue';

// Pinia
import { useInlineEditingStore } from '../stores/inlineEditing';

// Utils
import { createTiptapEditor } from '../utils/createTiptapEditor';
import { segmentsToTiptapDoc, tiptapDocToSegments } from '../utils/inlineContentTiptap';

// Constants
import { INLINE_EDITOR_HOST_KEY } from '../../common/constants/injectionKeys';
// #endregion

/**
 * Composable driving the TipTap inline editor on the canvas.
 * Loads TipTap lazily, owns its lifecycle, converts segments/HTML to TipTap and back.
 * Publishes the editor instance into inlineEditingStore so the overlay toolbar can reach it.
 *
 * The builder state is reached through the injected IInlineEditorHost (provided by
 * TheBuilderCanvas): text-editor does not import builder/core, and on a published page
 * there is no host, so the editor is never initialized.
 *
 * @param options - Component ID, property name, property type.
 */
export function useInlineEditor(options: IUseInlineEditorOptions): IUseInlineEditorReturn {
    const host = inject<IInlineEditorHost | null>(INLINE_EDITOR_HOST_KEY, null);
    const inlineEditingStore = useInlineEditingStore();

    const editor = shallowRef<Editor | null>(null);
    const editorContent = shallowRef<Component | null>(null);

    /** Original segments the media is restored from on the round trip */
    let originalSegments: IInlineContentSegment[] = [];

    /**
     * Flag that breaks the update cycle:
     * canvas onUpdate → store → watch → editor.setContent → onUpdate again.
     */
    let isInternalUpdate = false;

    const isActive = computed<boolean>(
        () =>
            inlineEditingStore.componentId === options.componentId &&
            inlineEditingStore.propName === options.propName
    );

    /** Reads the current property value out of the builder state */
    function getCurrentPropValue(): unknown {
        return host?.getPropValue(options.componentId, options.propName);
    }

    /**
     * Writes the current editor content into the builder state
     * (segments for inline-content, HTML for a textarea).
     */
    function persistEditorContent(): void {
        if (!editor.value || !host) {
            return;
        }

        if (options.propType === 'inline-content') {
            const doc = editor.value.getJSON();
            const segments = tiptapDocToSegments(doc, originalSegments);
            host.updateProp(options.componentId, options.propName, segments);
        } else {
            const html = editor.value.getHTML();
            host.updateProp(options.componentId, options.propName, html);
        }
    }

    /**
     * Saves the current editor content into the builder state (no history entry).
     * Called from onUpdate to keep the store and the sidebar in sync in real time.
     */
    function saveToStore(): void {
        if (!editor.value) {
            return;
        }

        isInternalUpdate = true;
        persistEditorContent();

        // Clear the flag on the next microtask, once the watch has fired
        Promise.resolve().then(() => {
            isInternalUpdate = false;
        });
    }

    /**
     * Saves the content with a history entry and destroys the editor.
     * Used when editing is stopped from the outside (Escape, switching the property).
     */
    function flushAndDestroy(): void {
        persistEditorContent();
        host?.commitHistory();
        destroy();
    }

    /** Initializes the TipTap editor (lazily). With no host (published) it is a no-op */
    async function initEditor(): Promise<void> {
        if (editor.value || !host) {
            return;
        }

        try {
            const currentValue = getCurrentPropValue();

            if (options.propType === 'inline-content') {
                const [{ Editor: TiptapEditor, EditorContent }, { InlineSegmentImage }] =
                    await Promise.all([
                        import('@tiptap/vue-3'),
                        import('../tiptap/inlineSegmentImage'),
                    ]);

                const { default: Document } = await import('@tiptap/extension-document');
                const { default: Paragraph } = await import('@tiptap/extension-paragraph');
                const { default: Text } = await import('@tiptap/extension-text');
                const { default: HardBreak } = await import('@tiptap/extension-hard-break');

                editorContent.value = EditorContent;
                const segments = Array.isArray(currentValue)
                    ? (currentValue as IInlineContentSegment[])
                    : [];
                originalSegments = [...segments];

                const doc = segmentsToTiptapDoc(segments);

                editor.value = new TiptapEditor({
                    content: doc,
                    extensions: [Document, Paragraph, Text, HardBreak, InlineSegmentImage],
                    editorProps: {
                        attributes: {
                            style: 'outline: none;',
                        },
                    },
                    onUpdate: saveToStore,
                });
            } else {
                const htmlContent = typeof currentValue === 'string' ? currentValue : '';

                const { editor: createdEditor, EditorContent } = await createTiptapEditor({
                    content: htmlContent,
                    editorProps: {
                        attributes: {
                            style: 'outline: none;',
                        },
                    },
                    onUpdate: saveToStore,
                });

                editorContent.value = EditorContent;
                editor.value = createdEditor;
            }

            // Publish the editor into the store so BuilderCanvasInlineEditingOverlay can reach it
            inlineEditingStore.setEditor(editor.value);
        } catch (error) {
            console.error('[useInlineEditor] Failed to init editor:', error);
        }
    }

    /** Saves the TipTap content into the builder state and stops editing */
    function saveAndStop(): void {
        if (editor.value) {
            persistEditorContent();
            host?.commitHistory();
        }

        inlineEditingStore.stopEditing();
        destroy();
    }

    /** Destroys the TipTap editor and clears the editor in the store */
    function destroy(): void {
        if (editor.value) {
            editor.value.destroy();
            editor.value = null;
        }
        editorContent.value = null;
        originalSegments = [];
        inlineEditingStore.setEditor(null);
    }

    // Editing stopped from the outside (Escape in BuilderCanvasItem): save and destroy
    watch(
        () => inlineEditingStore.componentId,
        (newId) => {
            if (newId !== options.componentId && editor.value) {
                flushAndDestroy();
            }
        }
    );

    // propName switched to another property of the same component: save the current
    // content and destroy the editor (the overlay will rebuild the fallback)
    watch(
        () => inlineEditingStore.propName,
        (newPropName) => {
            if (
                inlineEditingStore.componentId === options.componentId &&
                newPropName !== options.propName &&
                editor.value
            ) {
                flushAndDestroy();
            }
        }
    );

    // sidebar → canvas sync: when the store was updated from the outside (from the
    // sidebar), refresh the content of the canvas editor
    watch(
        () => getCurrentPropValue(),
        (newValue) => {
            if (!editor.value || isInternalUpdate) {
                return;
            }

            if (options.propType === 'textarea' && typeof newValue === 'string') {
                const currentHtml = editor.value.getHTML();
                if (newValue !== currentHtml) {
                    editor.value.commands.setContent(newValue, { emitUpdate: false });
                }
            }
        }
    );

    onBeforeUnmount(() => {
        destroy();
    });

    return {
        editor,
        editorContent,
        isActive,
        initEditor,
        saveAndStop,
        destroy,
    };
}
