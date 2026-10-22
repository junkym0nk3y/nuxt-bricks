// #region Imports
// Types
import type { Component } from 'vue';
import type { Editor, EditorOptions } from '@tiptap/vue-3';
// #endregion

// #region Interfaces
export interface ICreateTiptapEditorOptions {
    /** Initial editor content (HTML) */
    content: string;
    /** Editability (true by default) */
    editable?: boolean;
    /** ProseMirror editorProps (attributes of the contenteditable element and the like) */
    editorProps?: EditorOptions['editorProps'];
    /** Callback fired when the content changes */
    onUpdate?: EditorOptions['onUpdate'];
}

export interface ICreateTiptapEditorResult {
    editor: Editor;
    EditorContent: Component;
}
// #endregion

/**
 * Loads every TipTap module of the full rich-text editor lazily, in a single
 * Promise.all (keeps the code splitting — TipTap stays out of the main bundle).
 */
async function loadTiptapModules() {
    const [
        { Editor: TiptapEditor, EditorContent },
        { default: StarterKit },
        { default: Underline },
        { TextStyle },
        { default: Color },
        { default: FontFamily },
        { default: TextAlign },
        { FontSize },
        { FontWeight },
        { LineHeight },
        { LetterSpacing },
        { ResizableImage },
        { ResizableVideo },
        { BoldOverride },
    ] = await Promise.all([
        import('@tiptap/vue-3'),
        import('@tiptap/starter-kit'),
        import('@tiptap/extension-underline'),
        import('@tiptap/extension-text-style'),
        import('@tiptap/extension-color'),
        import('@tiptap/extension-font-family'),
        import('@tiptap/extension-text-align'),
        import('../tiptap/fontSize'),
        import('../tiptap/fontWeight'),
        import('../tiptap/lineHeight'),
        import('../tiptap/letterSpacing'),
        import('../tiptap/resizableImage'),
        import('../tiptap/resizableVideo'),
        import('../tiptap/boldOverride'),
    ]);

    return {
        TiptapEditor,
        EditorContent,
        StarterKit,
        Underline,
        TextStyle,
        Color,
        FontFamily,
        TextAlign,
        FontSize,
        FontWeight,
        LineHeight,
        LetterSpacing,
        ResizableImage,
        ResizableVideo,
        BoldOverride,
    };
}

/**
 * Single factory for the full TipTap editor (the textarea property type).
 * Builds an Editor with the complete set of extensions — the only place they are
 * configured.
 *
 * The built-in bold/underline of StarterKit are switched off: bold is replaced by
 * BoldOverride, underline comes in as a separate extension (in TipTap v3 keeping both
 * would be a duplicate).
 *
 * @param options - Content, editability, editorProps and onUpdate.
 * @returns The created Editor and the EditorContent component to render it with.
 */
export async function createTiptapEditor(
    options: ICreateTiptapEditorOptions
): Promise<ICreateTiptapEditorResult> {
    const modules = await loadTiptapModules();
    const {
        TiptapEditor,
        EditorContent,
        StarterKit,
        Underline,
        TextStyle,
        Color,
        FontFamily,
        TextAlign,
        FontSize,
        FontWeight,
        LineHeight,
        LetterSpacing,
        ResizableImage,
        ResizableVideo,
        BoldOverride,
    } = modules;

    const editor = new TiptapEditor({
        content: options.content,
        editable: options.editable ?? true,
        extensions: [
            StarterKit.configure({
                bold: false,
                bulletList: { keepMarks: true },
                orderedList: { keepMarks: true },
                underline: false,
                // Links already come with StarterKit, so the extension is configured
                // here instead of being added a second time: two extensions named
                // `link` crash the editor ("Duplicate extension names"). Switching
                // StarterKit off for links would work too, the way bold and underline
                // above do, but there is nothing to gain from it.
                link: {
                    // In the builder a click on a link places the cursor instead of
                    // following it: otherwise editing text would navigate away from
                    // the builder page.
                    openOnClick: false,
                    // A typed domain must not become a link on its own: autolinking
                    // marks it up on the fly, and the author ends up with a link
                    // (carrying its own target/rel) where they were merely typing text.
                    // Pasting still creates one — `linkOnPaste` stays at its default.
                    autolink: false,
                    defaultProtocol: 'https',
                    // Without zeroing the defaults the extension puts
                    // target="_blank" rel="noopener noreferrer nofollow" on EVERY
                    // link. target and rel are the author's call in the link modal,
                    // and nofollow on every external link is someone else's SEO
                    // decision.
                    HTMLAttributes: { target: null, rel: null, class: null },
                },
            }),
            BoldOverride,
            Underline,
            TextStyle,
            Color,
            FontFamily,
            FontSize,
            FontWeight,
            LineHeight,
            LetterSpacing,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
                alignments: ['left', 'center', 'right', 'justify'],
            }),
            ResizableImage,
            ResizableVideo,
        ],
        ...(options.editorProps ? { editorProps: options.editorProps } : {}),
        ...(options.onUpdate ? { onUpdate: options.onUpdate } : {}),
    });

    return { editor, EditorContent };
}
