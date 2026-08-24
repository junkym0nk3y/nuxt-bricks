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

    /**
     * The generation of an initialization. TipTap arrives over dynamic imports, and
     * over their awaits the editing can end, the target can be switched, or the
     * initialization can be started anew for the same target — an editor built for a
     * state that is gone must not reach the store.
     *
     * The watchers below cannot cover that window: both of them require `editor.value`,
     * which is still `null` while the import is on its way. An editor published after
     * the fact left the store holding an instance nobody edits, and the next inline
     * editing found the store busy and built nothing — the overlay opened over a text
     * that could not be typed into.
     */
    let initGeneration = 0;

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

    /**
     * Initializes the TipTap editor (lazily). With no host (published) it is a no-op.
     *
     * Everything is built into locals first and published in one step at the end: an
     * `editorContent` or an `originalSegments` set on the way would describe an editor
     * that may never arrive, and the overlay reads both.
     */
    async function initEditor(): Promise<void> {
        const generation = ++initGeneration;

        if (!host) {
            return;
        }

        // The editing was stopped and started again over the same target while this
        // instance survived: `stopEditing` drops the editor from the store, and nothing
        // else puts it back. Without this the text stayed editable while the toolbar of
        // the overlay drove nothing — no formatting, no media, no link
        if (editor.value) {
            if (isActive.value && inlineEditingStore.editor === null) {
                inlineEditingStore.setEditor(editor.value);
            }

            return;
        }

        let createdEditor: Editor | null = null;
        let createdContent: Component | null = null;
        let createdSegments: IInlineContentSegment[] = [];

        try {
            const currentValue = getCurrentPropValue();

            if (options.propType === 'inline-content') {
                const [
                    { Editor: TiptapEditor, EditorContent },
                    { InlineSegmentImage },
                    { default: Document },
                    { default: Paragraph },
                    { default: Text },
                    { default: HardBreak },
                ] = await Promise.all([
                    import('@tiptap/vue-3'),
                    import('../tiptap/inlineSegmentImage'),
                    import('@tiptap/extension-document'),
                    import('@tiptap/extension-paragraph'),
                    import('@tiptap/extension-text'),
                    import('@tiptap/extension-hard-break'),
                ]);

                const segments = Array.isArray(currentValue)
                    ? (currentValue as IInlineContentSegment[])
                    : [];

                createdContent = EditorContent;
                createdSegments = [...segments];
                createdEditor = new TiptapEditor({
                    content: segmentsToTiptapDoc(segments),
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

                const created = await createTiptapEditor({
                    content: htmlContent,
                    editorProps: {
                        attributes: {
                            style: 'outline: none;',
                        },
                    },
                    onUpdate: saveToStore,
                });

                createdContent = created.EditorContent;
                createdEditor = created.editor;
            }

            // The state this editor was built for is gone: the editing has ended, the
            // target has been switched, the initialization has been started anew, or
            // somebody else (the fallback of the overlay) got there first. Publishing it
            // would leave the toolbar driving an instance nobody edits, and `saveToStore`
            // of the stray editor would keep writing into the property left behind
            if (
                generation !== initGeneration ||
                !isActive.value ||
                inlineEditingStore.editor !== null
            ) {
                createdEditor.destroy();

                return;
            }

            originalSegments = createdSegments;
            editorContent.value = createdContent;
            editor.value = createdEditor;

            // Publish the editor into the store so BuilderCanvasInlineEditingOverlay can reach it
            inlineEditingStore.setEditor(createdEditor);
        } catch (error) {
            createdEditor?.destroy();
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

    /**
     * Destroys the TipTap editor and clears the editor in the store.
     *
     * The generation is raised as well: an editor still being imported belongs to the
     * state being torn down here, and it must not surface afterwards.
     *
     * The store is cleared only when it holds OUR instance. A component leaving the
     * canvas while another one is being edited used to wipe the editor of that other
     * one — after which the toolbar of the overlay drove nothing.
     */
    function destroy(): void {
        initGeneration += 1;

        const ownEditor = editor.value;
        if (ownEditor) {
            ownEditor.destroy();
            editor.value = null;
        }
        editorContent.value = null;
        originalSegments = [];

        if (ownEditor && inlineEditingStore.editor === ownEditor) {
            inlineEditingStore.setEditor(null);
        }
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
