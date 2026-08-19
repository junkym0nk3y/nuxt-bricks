// #region Imports
// Types
import type { Component } from 'vue';
import type { Editor, EditorOptions } from '@tiptap/vue-3';
// #endregion

// #region Interfaces
export interface ICreateTiptapEditorOptions {
    /** Начальное содержимое редактора (HTML). */
    content: string;
    /** Редактируемость (по умолчанию true). */
    editable?: boolean;
    /** ProseMirror editorProps (атрибуты contenteditable-элемента и т.п.). */
    editorProps?: EditorOptions['editorProps'];
    /** Колбэк на изменение содержимого. */
    onUpdate?: EditorOptions['onUpdate'];
}

export interface ICreateTiptapEditorResult {
    editor: Editor;
    EditorContent: Component;
}
// #endregion

/**
 * Lazy-загружает все TipTap-модули полнофункционального rich-text редактора
 * одним Promise.all (сохраняет code-splitting — TipTap не попадает в основной бандл).
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
 * Единая фабрика полнофункционального TipTap-редактора (textarea-тип).
 * Собирает Editor с полным набором extensions — единственная точка их конфигурации.
 *
 * Встроенные bold/underline StarterKit отключены: bold заменён на BoldOverride,
 * underline подключается отдельным расширением (иначе в TipTap v3 — дубль).
 *
 * @param options - Содержимое, редактируемость, editorProps и onUpdate.
 * @returns Созданный Editor и компонент EditorContent для рендеринга.
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
                // Ссылки уже входят в StarterKit — отдельным расширением их не
                // подключать: два расширения с именем `link` роняют редактор
                // («Duplicate extension names»). Настраивается только конфигом.
                link: {
                    // В билдере клик по ссылке — постановка курсора, а не переход:
                    // иначе редактирование текста уводило бы со страницы билдера.
                    openOnClick: false,
                    // Ссылка появляется только по явному действию: автолинковка
                    // размечает набранный домен на лету, и автор получает ссылку
                    // (со своим target/rel) там, где просто печатал текст.
                    autolink: false,
                    defaultProtocol: 'https',
                    // Без обнуления дефолтов расширение вешает
                    // target="_blank" rel="noopener noreferrer nofollow" на КАЖДУЮ
                    // ссылку. target и rel задаёт автор в модалке ссылки, nofollow
                    // всем внешним ссылкам подряд — чужое SEO-решение.
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
