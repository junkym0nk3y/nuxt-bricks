<script setup lang="ts">
// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IBricksTextAreaProps, IBricksTextAreaEmits } from './types.d.ts';
import type { IToolbarGroup } from '../../editor/types/text-editor-toolbar.d.ts';

// Vue
import {
    computed,
    defineAsyncComponent,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    useCssModule,
    watch,
    watchEffect,
    type Component,
} from 'vue';

// Nuxt
import { useNuxtApp } from 'nuxt/app';

// Composables
import { useLandingConfig } from '../../composables/useLandingConfig';

// Pinia
import { useLandingInlineEditingStore } from '../../stores/landing/inlineEditing';
// Components
import BricksButton from '../base/button/BricksButton.vue';
import BricksTextEditorToolbar from './BricksTextEditorToolbar.vue';
import BricksTooltip from '../tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../tooltip/BricksTooltipHint.vue';

const TheTextEditorModal = defineAsyncComponent(() => import('../../editor/components/TheTextEditorModal.vue'));
const TiptapImageFloatPopover = defineAsyncComponent(
    () => import('../../editor/components/TiptapImageFloatPopover.vue')
);
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTextAreaProps>(), {
    value: '',
    label: '',
    placeholder: '',
    disabled: false,
    toolbar: true,
    minHeight: 180,
    useRichEditor: true,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksTextAreaEmits>();
// #endregion

// #region Data
const { $textEditorToolbar } = useNuxtApp();
const config = useLandingConfig();
const inlineEditingStore = useLandingInlineEditingStore();
const $style = useCssModule();
const innerValue = ref<string>(props.value ?? '');
const isClient = ref(false);
const loadingError = ref<unknown | null>(null);
const currentFontSize = ref<string>('1.6rem');
const currentFontWeight = ref<string>('');
const currentColor = ref<string>('#000000');
const currentFontFamily = ref<string>('');
const currentLineHeight = ref<string>('');
const currentLetterSpacing = ref<string>('');

/** Счётчик транзакций для реактивного обновления toolbar */
const editorTransactionCount = ref<number>(0);

const isCodeView = ref(false);
const isDarkEditorBackground = ref(false);
const isExpandedModalOpen = ref(false);
const editor = shallowRef<Editor | null>(null);
const EditorContentComponent = shallowRef<Component | null>(null);

const availableFonts = computed(() => config.fonts ?? []);

// #endregion

// #region Computed
/**
 * Стили для редактора (минимальная высота)
 */
const editorStyles = computed(() => ({
    minHeight: `${props.minHeight}px`,
}));

/**
 * CSS классы для wrapper компонента
 */
const wrapperClasses = computed(() => [
    $style.BricksTextArea,
    {
        [$style._disabled]: props.disabled,
        [$style._error]: Boolean(loadingError.value),
    },
]);

const editorWrapperClasses = computed(() => [
    $style.editorWrapper,
    {
        [$style._darkPreview]: isDarkEditorBackground.value,
    },
]);

/**
 * Конфигурация toolbar групп из плагина
 */
const toolbarGroups = computed<IToolbarGroup[]>(() => {
    if (
        props.useRichEditor === false ||
        !editor.value ||
        !isClient.value ||
        editorTransactionCount.value < 0
    ) {
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

const isToolbarVisible = computed(
    () =>
        props.useRichEditor && props.toolbar && !isCodeView.value && toolbarGroups.value.length > 0
);
// #endregion

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

// #region Lifecycle
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
                    'data-placeholder': placeholder || 'Введите текст…',
                },
            },
        });
    }
);
// #endregion

// #region Methods
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
 * Закрывает модальный редактор.
 */
function handleModalClose(): void {
    isExpandedModalOpen.value = false;
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
    inlineEditingStore.requestMedia((item) => {
        if (item.mimeType.startsWith('video/')) {
            ed.chain().focus().setVideo({ src: item.url }).run();
        } else {
            ed.chain()
                .focus()
                .setImage({
                    src: item.url,
                    alt: item.alt || item.filename,
                })
                .run();
        }
    });
}

/**
 * Инициализирует rich text редактор только на клиенте
 */
async function initEditor(): Promise<void> {
    if (import.meta.server || props.useRichEditor === false || editor.value) {
        return;
    }

    try {
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
            import('../../editor/tiptap/fontSize'),
            import('../../editor/tiptap/fontWeight'),
            import('../../editor/tiptap/lineHeight'),
            import('../../editor/tiptap/letterSpacing'),
            import('@tiptap/extension-table'),
            import('../../editor/tiptap/resizableImage'),
            import('../../editor/tiptap/resizableVideo'),
            import('../../editor/tiptap/boldOverride'),
        ]);

        EditorContentComponent.value = EditorContent;

        const createdEditor = new TiptapEditor({
            element: document.createElement('div'),
            content: innerValue.value,
            editable: !props.disabled,
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
            onUpdate: ({ editor: instance }) => {
                const html = instance.getHTML();
                if (html !== innerValue.value) {
                    handleContentUpdate(html);
                }
            },
        });

        editor.value = createdEditor ?? null;

        if (!editor.value) {
            loadingError.value = new Error('Editor failed to initialize');
        } else {
            loadingError.value = null;
        }
    } catch (error) {
        loadingError.value =
            error instanceof Error ? error : new Error('Failed to load rich text editor');
    }
}
// #endregion

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

onMounted(() => {
    isClient.value = true;
    initEditor();
});

onBeforeUnmount(() => {
    editor.value?.destroy();
});
</script>

<template>
    <div :class="wrapperClasses">
        <!-- Rich Text Editor Toolbar + Code Toggle -->
        <div v-if="props.useRichEditor !== false && props.toolbar" :class="$style.toolbarSection">
            <div :class="$style.toolbarActions">
                <BricksButton
                    :class="$style.codeToggle"
                    :disabled="props.disabled"
                    :active="isCodeView"
                    variant="secondary"
                    size="sm"
                    @click="toggleCodeView"
                >
                    <BricksLandIcon :icon="isCodeView ? 'ph:eye' : 'ph:code'" />
                    <span>{{ isCodeView ? 'Рендер' : 'Код' }}</span>
                </BricksButton>
            </div>

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
        </div>

        <!-- Editor Content / Code View -->
        <template v-if="props.useRichEditor !== false">
            <transition name="library-fade" mode="out-in">
                <div
                    v-if="!isCodeView && editor && isClient && EditorContentComponent"
                    :class="editorWrapperClasses"
                >
                    <component
                        :is="EditorContentComponent"
                        :editor="editor"
                        :style="editorStyles"
                        :class="$style.editor"
                    />

                    <TiptapImageFloatPopover :editor="editor" />

                    <BricksTooltip bottom :class="$style.expandButtonWrapper">
                        <template #activator>
                            <button
                                type="button"
                                :class="$style.expandButton"
                                :disabled="props.disabled"
                                @click="isExpandedModalOpen = true"
                            >
                                <BricksLandIcon icon="ph:arrows-out" />
                            </button>
                        </template>
                        <BricksTooltipHint text="Развернуть" />
                    </BricksTooltip>
                </div>
                <div v-else :class="editorWrapperClasses">
                    <textarea
                        :class="[$style.fallbackArea, { [$style.codeArea]: isCodeView }]"
                        :disabled="props.disabled"
                        :placeholder="props.placeholder"
                        :style="editorStyles"
                        :value="innerValue"
                        spellcheck="false"
                        @input="handleTextareaInput"
                    >
                    </textarea>

                    <BricksTooltip bottom :class="$style.expandButtonWrapper">
                        <template #activator>
                            <button
                                type="button"
                                :class="$style.expandButton"
                                :disabled="props.disabled"
                                @click="isExpandedModalOpen = true"
                            >
                                <BricksLandIcon icon="ph:arrows-out" />
                            </button>
                        </template>
                        <BricksTooltipHint text="Развернуть" />
                    </BricksTooltip>
                </div>
            </transition>
        </template>

        <!-- Fallback Textarea when rich editor disabled -->
        <textarea
            v-else
            :class="$style.fallbackArea"
            :disabled="props.disabled"
            :placeholder="props.placeholder"
            :style="editorStyles"
            :value="innerValue"
            @input="handleTextareaInput"
        ></textarea>

        <!-- Error Message -->
        <p v-if="loadingError" :class="$style.error">
            Не удалось загрузить редактор. Используется простой textarea.
        </p>

        <!-- Expanded Modal Editor -->
        <TheTextEditorModal
            :is-open="isExpandedModalOpen"
            :value="innerValue"
            :disabled="props.disabled"
            @update:value="handleModalUpdate"
            @close="handleModalClose"
        />
    </div>
</template>

<style module lang="scss">
.BricksTextArea {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    width: 100%;

    &._disabled {
        opacity: 0.6;
        pointer-events: none;
    }
}

.label {
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--land-base-600);
    user-select: none;
}

.editorWrapper {
    position: relative;

    &._darkPreview {
        :global(.ProseMirror) {
            background-color: #212226;
        }

        .editor {
            border-color: #212226;
            background-color: #212226;
        }

        .fallbackArea {
            border-color: #212226;
            background-color: #212226;
        }
    }
}

.editor {
    /* Фиксируем светлую тему для области ввода контента */
    --land-base-0: #fff;
    --land-base-300: #d1d5db;
    --land-base-900: #111827;

    overflow: hidden;
    min-height: inherit;
    padding: 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--land-base-300);
    background-color: var(--land-base-0);
    font-size: 1.4rem;
    line-height: 1.6;
    color: var(--land-base-900);

    :global(.ProseMirror) {
        min-height: inherit;
        outline: none;

        &:focus {
            border-color: var(--land-primary);
        }
    }
}

.fallbackArea {
    /* Фиксируем светлую тему для области ввода контента */
    --land-base-0: #fff;
    --land-base-300: #d1d5db;
    --land-base-900: #111827;

    width: 100%;
    min-height: inherit;
    padding: 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--land-base-300);
    background-color: var(--land-base-0);
    font-size: 1.4rem;
    line-height: 1.6;
    color: var(--land-base-900);
    resize: vertical;
    transition: border-color 0.2s ease;

    &:focus {
        border-color: var(--land-primary);
        outline: none;
    }
}

.error {
    margin: 0;
    font-size: 1.2rem;
    color: var(--land-danger-600);
}

.toolbarSection {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    width: 100%;
}

.toolbarActions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
}

.toolbar {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    padding: 0.6rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--land-base-300);
    background-color: var(--land-base-50);
}

.codeToggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }
}

.codeArea {
    white-space: pre-wrap;
    font-family: 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
    line-height: 1.6;
}

.expandButtonWrapper {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    opacity: 0;
    transition: opacity var(--default-transition);

    .editorWrapper:hover & {
        opacity: 1;
    }
}

.expandButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--land-base-200);
    background: var(--land-base-0);
    color: var(--land-base-500);
    transition:
        border-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }

    &:hover {
        border-color: var(--land-primary);
        color: var(--land-primary);
    }
}
</style>
