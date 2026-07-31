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
 * Composable для управления TipTap inline-editor на канвасе.
 * Lazy-загружает TipTap, управляет lifecycle, конвертирует segments/HTML ↔ TipTap.
 * Публикует editor-инстанс в inlineEditingStore для доступа из overlay-тулбара.
 *
 * Доступ к состоянию билдера — через инжектируемый IInlineEditorHost
 * (провайдит TheBuilderCanvas): text-editor не импортирует builder/core,
 * на published-странице хоста нет и редактор не инициализируется.
 *
 * @param options - ID компонента, имя свойства, тип свойства.
 */
export function useInlineEditor(options: IUseInlineEditorOptions): IUseInlineEditorReturn {
    const host = inject<IInlineEditorHost | null>(INLINE_EDITOR_HOST_KEY, null);
    const inlineEditingStore = useInlineEditingStore();

    const editor = shallowRef<Editor | null>(null);
    const editorContent = shallowRef<Component | null>(null);

    /** Оригинальные сегменты для round-trip восстановления медиа */
    let originalSegments: IInlineContentSegment[] = [];

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
     * Получает текущее значение свойства из состояния билдера.
     */
    function getCurrentPropValue(): unknown {
        return host?.getPropValue(options.componentId, options.propName);
    }

    /**
     * Записывает текущее содержимое editor в состояние билдера
     * (segments для inline-content, HTML для textarea).
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
     * Сохраняет текущее содержимое editor в состояние билдера (без записи истории).
     * Вызывается из onUpdate для real-time sync со store и sidebar.
     */
    function saveToStore(): void {
        if (!editor.value) {
            return;
        }

        isInternalUpdate = true;
        persistEditorContent();

        // Сбрасываем флаг в следующем микротаске, после того как watch сработает
        Promise.resolve().then(() => {
            isInternalUpdate = false;
        });
    }

    /**
     * Сохраняет содержимое с записью в историю и уничтожает editor.
     * Используется при остановке editing извне (Escape, переключение свойства).
     */
    function flushAndDestroy(): void {
        persistEditorContent();
        host?.commitHistory();
        destroy();
    }

    /**
     * Инициализирует TipTap editor (lazy). Без хоста (published) — no-op.
     */
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

            // Публикуем editor в store для доступа из BuilderCanvasInlineEditingOverlay
            inlineEditingStore.setEditor(editor.value);
        } catch (error) {
            console.error('[useInlineEditor] Failed to init editor:', error);
        }
    }

    /**
     * Сохраняет содержимое TipTap в состояние билдера и останавливает editing.
     */
    function saveAndStop(): void {
        if (editor.value) {
            persistEditorContent();
            host?.commitHistory();
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

    // Если editing остановлен извне (Escape из BuilderCanvasItem) — сохраняем и уничтожаем
    watch(
        () => inlineEditingStore.componentId,
        (newId) => {
            if (newId !== options.componentId && editor.value) {
                flushAndDestroy();
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
                flushAndDestroy();
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
