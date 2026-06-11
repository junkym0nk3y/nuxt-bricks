<script setup lang="ts">
// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IToolbarGroup } from '../types/text-editor-toolbar.d.ts';

// Vue
import {
    ref,
    shallowRef,
    computed,
    watch,
    watchEffect,
    onBeforeUnmount,
    type Component,
} from 'vue';

// Nuxt
import { useNuxtApp } from 'nuxt/app';

// Composables
import { useLandingConfig } from '../../common/composables/useLandingConfig';

// Pinia
import { useInlineEditingStore } from '../stores/inlineEditing';

// Components
import BricksButton from '../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../ui/base/modal/BricksModal.vue';
import BricksTextEditorToolbar from '../../ui/inputs/BricksTextEditorToolbar.vue';
import TiptapImageFloatPopover from './TiptapImageFloatPopover.vue';
// #endregion

// #region Interfaces
interface ITheTextEditorModalProps {
    isOpen: boolean;
    value: string;
    disabled?: boolean;
}

interface ITheTextEditorModalEmits {
    close: [];
    'update:value': [value: string];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<ITheTextEditorModalProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<ITheTextEditorModalEmits>();
// #endregion

// #region Data
const { $textEditorToolbar } = useNuxtApp();
const config = useLandingConfig();
const inlineEditingStore = useInlineEditingStore();

const editor = shallowRef<Editor | null>(null);
const EditorContentComponent = shallowRef<Component | null>(null);
const isCodeView = ref(false);
const isDarkEditorBackground = ref(false);
const codeValue = ref('');
const currentFontSize = ref<string>('1.6rem');
const currentFontWeight = ref<string>('');
const currentColor = ref<string>('#000000');
const currentFontFamily = ref<string>('');
const currentLineHeight = ref<string>('');
const currentLetterSpacing = ref<string>('');

/** Счётчик транзакций для реактивного обновления toolbar */
const editorTransactionCount = ref<number>(0);

const availableFonts = computed(() => config.fonts ?? []);
// #endregion

// #region Computed
/**
 * Конфигурация toolbar групп из плагина.
 */
const toolbarGroups = computed<IToolbarGroup[]>(() => {
    if (!editor.value || editorTransactionCount.value < 0) {
        return [];
    }

    return $textEditorToolbar.createToolbarConfig({
        editor: editor.value,
        availableFonts: availableFonts.value,
        currentFontSize,
        currentFontWeight,
        currentColor,
        currentFontFamily,
        currentLineHeight,
        currentLetterSpacing,
    });
});

const isToolbarVisible = computed(() => !isCodeView.value && toolbarGroups.value.length > 0);
// #endregion

// #region Methods
/**
 * Инициализирует TipTap редактор с полным набором расширений.
 */
async function initEditor(): Promise<void> {
    if (editor.value) {
        return;
    }

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

    EditorContentComponent.value = EditorContent;

    editor.value = new TiptapEditor({
        content: props.value,
        editable: !props.disabled,
        extensions: [
            StarterKit.configure({
                bold: false,
                bulletList: { keepMarks: true },
                orderedList: { keepMarks: true },
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
        onUpdate: ({ editor: instance }) => {
            codeValue.value = instance.getHTML();
        },
    });

    codeValue.value = props.value;
}

/**
 * Уничтожает TipTap редактор и очищает ресурсы.
 */
function destroyEditor(): void {
    editor.value?.destroy();
    editor.value = null;
    EditorContentComponent.value = null;
    isCodeView.value = false;
    isDarkEditorBackground.value = false;
}

/**
 * Переключает отображение между визуальным режимом и кодом.
 */
function toggleCodeView(): void {
    isCodeView.value = !isCodeView.value;

    if (!isCodeView.value && editor.value) {
        editor.value.commands.setContent(codeValue.value, { emitUpdate: false });
    }
}

/**
 * Переключает фон визуального редактора между светлым и тёмным.
 */
function toggleEditorBackground(): void {
    isDarkEditorBackground.value = !isDarkEditorBackground.value;
}

/**
 * Обрабатывает ввод в code-view textarea.
 */
function handleCodeInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    codeValue.value = target.value;
}

/**
 * Подтверждает изменения и закрывает модалку.
 */
function handleDone(): void {
    const html = isCodeView.value ? codeValue.value : (editor.value?.getHTML() ?? codeValue.value);

    emit('update:value', html);
    emit('close');
}

/**
 * Запрашивает медиа через MediaGallery и вставляет в редактор.
 */
function handleRequestImage(): void {
    if (!editor.value) {
        return;
    }

    const currentEditor = editor.value;

    inlineEditingStore.requestMedia((item) => {
        if (item.mimeType.startsWith('video/')) {
            currentEditor.chain().focus().setVideo({ src: item.url }).run();
        } else {
            currentEditor
                .chain()
                .focus()
                .setImage({
                    src: item.url,
                    alt: item.alt || item.filename,
                })
                .run();
        }
    });
}
// #endregion

// #region Lifecycle
/**
 * Подписывается на TipTap-транзакции для синхронизации toolbar state с курсором.
 */
watchEffect((onCleanup) => {
    const ed = editor.value;
    if (!ed) {
        return;
    }

    function handleTransaction(): void {
        editorTransactionCount.value++;
        $textEditorToolbar.syncToolbarState(ed!, {
            currentFontSize,
            currentFontWeight,
            currentColor,
            currentFontFamily,
            currentLineHeight,
            currentLetterSpacing,
        });
    }

    ed.on('transaction', handleTransaction);
    onCleanup(() => {
        ed.off('transaction', handleTransaction);
    });
});

watch(
    () => props.isOpen,
    async (newIsOpen) => {
        if (typeof window === 'undefined') {
            return;
        }

        if (newIsOpen) {
            await initEditor();
            if (editor.value && editor.value.getHTML() !== props.value) {
                editor.value.commands.setContent(props.value, { emitUpdate: false });
            }
            codeValue.value = props.value;
        } else {
            destroyEditor();
        }
    },
    { immediate: true }
);

onBeforeUnmount(() => {
    destroyEditor();
});
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        title="Редактор текста"
        :z-index="10000"
        @close="handleDone"
    >
        <div :class="$style.TheTextEditorModal">
            <!-- Header -->
            <div :class="$style.header">
                <h2 :class="$style.title">Редактор текста</h2>

                <div :class="$style.headerActions">
                    <BricksButton
                        :active="isCodeView"
                        variant="secondary"
                        size="sm"
                        :disabled="props.disabled"
                        @click="toggleCodeView"
                    >
                        <BricksIcon :icon="isCodeView ? 'ph:eye' : 'ph:code'" />
                        <span>{{ isCodeView ? 'Рендер' : 'Код' }}</span>
                    </BricksButton>

                    <BricksCloseButton @click="handleDone" />
                </div>
            </div>

            <!-- Toolbar -->
            <transition name="library-fade" mode="out-in">
                <div v-if="isToolbarVisible" :class="$style.toolbar">
                    <BricksTextEditorToolbar
                        :groups="toolbarGroups"
                        use-tooltips
                        show-image-insert
                        show-background-toggle
                        :is-dark-background="isDarkEditorBackground"
                        :disabled-background-toggle="props.disabled || isCodeView"
                        @request-image="handleRequestImage"
                        @toggle-background="toggleEditorBackground"
                    />
                </div>
            </transition>

            <!-- Editor Content -->
            <div :class="$style.body">
                <transition name="library-fade" mode="out-in">
                    <div
                        v-if="!isCodeView && editor && EditorContentComponent"
                        :class="[
                            $style.editorWrapper,
                            { [$style._darkPreview]: isDarkEditorBackground },
                        ]"
                    >
                        <component
                            :is="EditorContentComponent"
                            :editor="editor"
                            :class="$style.editor"
                        />

                        <TiptapImageFloatPopover :editor="editor" />
                    </div>
                    <div v-else :class="$style.editorWrapper">
                        <textarea
                            :class="[$style.codeArea]"
                            :disabled="props.disabled"
                            :value="codeValue"
                            spellcheck="false"
                            placeholder="Введите HTML-код…"
                            @input="handleCodeInput"
                        />
                    </div>
                </transition>
            </div>

            <!-- Footer -->
            <div :class="$style.footer">
                <BricksButton variant="primary" size="md" @click="handleDone">
                    Готово
                </BricksButton>
            </div>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TheTextEditorModal {
    overflow: hidden;
    display: flex;
    width: 104rem;
    max-width: 90vw;
    height: 80vh;
    border-radius: 1.2rem;
    background-color: var(--bricks-base-0);
    box-shadow: var(--shadow-md);
    flex-direction: column;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.6rem 2.4rem;
    border-bottom: 1px solid var(--bricks-base-300);
}

.title {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.headerActions {
    display: flex;
    align-items: center;
    gap: 0.8rem;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }
}

.toolbar {
    display: flex;
    flex-wrap: wrap;
    padding: 0.8rem 2.4rem;
    border-bottom: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-50);
}

.body {
    overflow: hidden;
    display: flex;
    flex: 1;
    min-height: 0;
}

.editorWrapper {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;

    &._darkPreview {
        :global(.ProseMirror) {
            background-color: #212226;
        }

        .editor {
            background-color: #212226;
        }
    }
}

.editor {
    /* Фиксируем светлую тему для области ввода контента */
    --bricks-base-0: #fff;
    --bricks-base-300: #d1d5db;
    --bricks-base-900: #111827;

    flex: 1;
    padding: 2.4rem;
    background-color: var(--bricks-base-0);
    font-size: 1.4rem;
    line-height: 1.6;
    color: var(--bricks-base-900);

    :global(.ProseMirror) {
        min-height: 100%;
        outline: none;
    }
}

.codeArea {
    flex: 1;
    width: 100%;
    padding: 2.4rem;
    border: none;
    background-color: var(--bricks-base-0);
    outline: none;
    white-space: pre-wrap;
    font-family: 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
    font-size: 1.4rem;
    line-height: 1.6;
    color: var(--bricks-base-900);
    resize: none;
}

.footer {
    display: flex;
    justify-content: flex-end;
    padding: 1.2rem 2.4rem;
    border-top: 1px solid var(--bricks-base-300);
}
</style>
