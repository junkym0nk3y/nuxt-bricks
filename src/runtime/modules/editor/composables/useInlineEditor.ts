// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { ILandingInlineContentSegment } from '../../layouts-blocks/types/layouts';

// Vue
import {
    shallowRef,
    computed,
    watch,
    onBeforeUnmount,
    type ComputedRef,
    type Component,
    type ShallowRef,
} from 'vue';

// Pinia
import { useComponentsStore } from '../../builder/stores/components';
import {
    useInlineEditingStore,
    type InlineEditingPropType,
} from '../stores/inlineEditing';

// Utils
import { segmentsToTiptapDoc, tiptapDocToSegments } from '../utils/inlineContentTiptap';
// #endregion

// #region Interfaces
interface IUseInlineEditorOptions {
    componentId: string;
    propName: string;
    propType: InlineEditingPropType;
}

interface IUseInlineEditorReturn {
    editor: ShallowRef<Editor | null>;
    editorContent: ShallowRef<Component | null>;
    isActive: ComputedRef<boolean>;
    initEditor: () => Promise<void>;
    saveAndStop: () => void;
    destroy: () => void;
}
// #endregion

/**
 * Composable для управления TipTap inline-editor на канвасе.
 * Lazy-загружает TipTap, управляет lifecycle, конвертирует segments/HTML ↔ TipTap.
 * Публикует editor-инстанс в inlineEditingStore для доступа из overlay-тулбара.
 *
 * @param options - ID компонента, имя свойства, тип свойства.
 */
export function useInlineEditor(
    options: IUseInlineEditorOptions
): IUseInlineEditorReturn {
    const componentsStore = useComponentsStore();
    const inlineEditingStore = useInlineEditingStore();

    const editor = shallowRef<Editor | null>(null);
    const editorContent = shallowRef<Component | null>(null);

    /** Оригинальные сегменты для round-trip восстановления медиа */
    let originalSegments: ILandingInlineContentSegment[] = [];

    /**
     * Флаг для предотвращения циклического обновления:
     * canvas onUpdate → store → watch → editor.setContent → onUpdate снова.
     */
    let isInternalUpdate = false;

    const isActive = computed<boolean>(
        () =>
            inlineEditingStore.componentId === options.componentId &&
            inlineEditingStore.propName === options.propName
    );

    /**
     * Получает текущее значение свойства из store.
     */
    function getCurrentPropValue(): unknown {
        const component = componentsStore.getComponentById(options.componentId);
        if (!component?.props) {
            return undefined;
        }
        return (component.props as Record<string, unknown>)[options.propName];
    }

    /**
     * Сохраняет текущее содержимое editor в store (без записи истории).
     * Вызывается из onUpdate для real-time sync со store и sidebar.
     */
    function saveToStore(): void {
        if (!editor.value) {
            return;
        }

        isInternalUpdate = true;

        if (options.propType === 'inline-content') {
            const doc = editor.value.getJSON();
            const segments = tiptapDocToSegments(doc, originalSegments);
            componentsStore.updateComponentProp(
                options.componentId,
                options.propName,
                segments as unknown as Array<unknown>
            );
        } else {
            const html = editor.value.getHTML();
            componentsStore.updateComponentProp(options.componentId, options.propName, html);
        }

        // Сбрасываем флаг в следующем микротаске, после того как watch сработает
        Promise.resolve().then(() => {
            isInternalUpdate = false;
        });
    }

    /**
     * Инициализирует TipTap editor (lazy).
     */
    async function initEditor(): Promise<void> {
        if (editor.value) {
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
                    ? (currentValue as ILandingInlineContentSegment[])
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
                    { Table, TableRow, TableCell, TableHeader },
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
                    import('@tiptap/extension-table'),
                    import('../tiptap/resizableImage'),
                    import('../tiptap/resizableVideo'),
                    import('../tiptap/boldOverride'),
                ]);

                editorContent.value = EditorContent;
                const htmlContent = typeof currentValue === 'string' ? currentValue : '';

                editor.value = new TiptapEditor({
                    content: htmlContent,
                    extensions: [
                        StarterKit.configure({
                            bold: false,
                            bulletList: { keepMarks: true },
                            orderedList: { keepMarks: true },
                            underline: false,
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
                        Table.configure({
                            resizable: false,
                            HTMLAttributes: { class: 'ida-tiptap-table' },
                        }),
                        TableRow,
                        TableCell,
                        TableHeader,
                        ResizableImage,
                        ResizableVideo,
                    ],
                    editorProps: {
                        attributes: {
                            style: 'outline: none;',
                        },
                    },
                    onUpdate: saveToStore,
                });
            }

            // Публикуем editor в store для доступа из CanvasInlineEditingOverlay
            inlineEditingStore.setEditor(editor.value);
        } catch (error) {
            console.error('[useInlineEditor] Failed to init editor:', error);
        }
    }

    /**
     * Сохраняет содержимое TipTap в store и останавливает editing.
     */
    function saveAndStop(): void {
        if (editor.value) {
            if (options.propType === 'inline-content') {
                const doc = editor.value.getJSON();
                const segments = tiptapDocToSegments(doc, originalSegments);
                componentsStore.updateComponentProp(
                    options.componentId,
                    options.propName,
                    segments as unknown as Array<unknown>
                );
            } else {
                const html = editor.value.getHTML();
                componentsStore.updateComponentProp(options.componentId, options.propName, html);
            }

            componentsStore.saveToHistory();
        }

        inlineEditingStore.stopEditing();
        destroy();
    }

    /**
     * Уничтожает TipTap editor и сбрасывает editor в store.
     */
    function destroy(): void {
        if (editor.value) {
            editor.value.destroy();
            editor.value = null;
        }
        editorContent.value = null;
        originalSegments = [];
        inlineEditingStore.setEditor(null);
    }

    // Если editing остановлен извне (Escape из CanvasItem) — сохраняем и уничтожаем
    watch(
        () => inlineEditingStore.componentId,
        (newId) => {
            if (newId !== options.componentId && editor.value) {
                if (options.propType === 'inline-content') {
                    const doc = editor.value.getJSON();
                    const segments = tiptapDocToSegments(doc, originalSegments);
                    componentsStore.updateComponentProp(
                        options.componentId,
                        options.propName,
                        segments as unknown as Array<unknown>
                    );
                } else {
                    const html = editor.value.getHTML();
                    componentsStore.updateComponentProp(
                        options.componentId,
                        options.propName,
                        html
                    );
                }

                componentsStore.saveToHistory();
                destroy();
            }
        }
    );

    // Если propName переключилось на другое свойство в рамках того же компонента —
    // сохраняем текущее содержимое и уничтожаем editor (overlay пересоздаст fallback)
    watch(
        () => inlineEditingStore.propName,
        (newPropName) => {
            if (
                inlineEditingStore.componentId === options.componentId &&
                newPropName !== options.propName &&
                editor.value
            ) {
                if (options.propType === 'inline-content') {
                    const doc = editor.value.getJSON();
                    const segments = tiptapDocToSegments(doc, originalSegments);
                    componentsStore.updateComponentProp(
                        options.componentId,
                        options.propName,
                        segments as unknown as Array<unknown>
                    );
                } else {
                    const html = editor.value.getHTML();
                    componentsStore.updateComponentProp(
                        options.componentId,
                        options.propName,
                        html
                    );
                }

                componentsStore.saveToHistory();
                destroy();
            }
        }
    );

    // Синхронизация sidebar → canvas: если store обновился снаружи (из sidebar),
    // обновляем содержимое canvas-редактора
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
