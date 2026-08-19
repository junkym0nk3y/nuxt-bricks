// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { ITextEditorAreaProps } from '../components/types.d.ts';
import type { ITextEditorArea } from '../types/composables';

// Vue
import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component } from 'vue';
import { useI18n } from 'vue-i18n';

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
 * Логика TextEditorArea: lifecycle TipTap-редактора (lazy-инициализация на клиенте,
 * destroy на unmount), синхронизация props.value/disabled/placeholder с редактором,
 * тогглы code-view и тёмного фона, обработчики контента и вставки медиа.
 *
 * @param props - Пропсы TextEditorArea (реактивный объект defineProps).
 * @param emit - Функция emit компонента (событие update:value).
 */
export function useTextEditorArea(
    props: ITextEditorAreaProps,
    emit: (event: 'update:value', value: string) => void
): ITextEditorArea {
    const { t } = useI18n();
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

    /**
     * Переключает отображение между визуальным режимом и кодом
     */
    function toggleCodeView(): void {
        if (props.useRichEditor === false) {
            return;
        }

        isCodeView.value = !isCodeView.value;

        if (!isCodeView.value && editor.value && editor.value.getHTML() !== innerValue.value) {
            editor.value.commands.setContent(innerValue.value, { emitUpdate: false });
        }
    }

    /**
     * Переключает фон визуального редактора между светлым и тёмным.
     */
    function toggleEditorBackground(): void {
        isDarkEditorBackground.value = !isDarkEditorBackground.value;
    }

    /**
     * Обновляет внутреннее значение и эмитит событие update:value
     */
    function handleContentUpdate(content: string): void {
        innerValue.value = content;
        emit('update:value', content);
    }

    /**
     * Обрабатывает ввод в fallback textarea (без rich editor)
     */
    function handleTextareaInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        const value = target.value;
        if (editor.value && editor.value.getHTML() !== value) {
            editor.value.commands.setContent(value, { emitUpdate: false });
        }
        handleContentUpdate(value);
    }

    /**
     * Обрабатывает обновление значения из модального редактора.
     */
    function handleModalUpdate(value: string): void {
        handleContentUpdate(value);
        if (editor.value && editor.value.getHTML() !== value) {
            editor.value.commands.setContent(value, { emitUpdate: false });
        }
    }

    /**
     * Запрашивает медиа из MediaGallery через inlineEditingStore.
     * При выборе вставляет изображение или видео в TipTap-редактор.
     */
    function handleRequestImage(): void {
        if (!editor.value) {
            return;
        }

        const ed = editor.value;
        inlineEditingStore.requestMedia((item) => insertMediaIntoEditor(ed, item));
    }

    /**
     * Инициализирует rich text редактор только на клиенте
     */
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

    watch(
        () => props.placeholder,
        (placeholder) => {
            if (props.useRichEditor === false || !editor.value) {
                return;
            }
            editor.value.setOptions({
                editorProps: {
                    ...editor.value.options.editorProps,
                    attributes: {
                        ...(editor.value.options.editorProps?.attributes || {}),
                        'data-placeholder': placeholder || t('bricks.textEditor.textPlaceholder'),
                    },
                },
            });
        }
    );

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
