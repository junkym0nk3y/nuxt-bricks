<script setup lang="ts">
// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { ITextEditorAreaProps, ITextEditorAreaEmits } from './types.d.ts';

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
    type Component,
} from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { createTiptapEditor } from '../utils/createTiptapEditor';
import { insertMediaIntoEditor } from '../utils/insertMediaIntoEditor';

// Composables
import { useToolbarStateSync } from '../composables/useToolbarStateSync';

// Pinia
import { useInlineEditingStore } from '../stores/inlineEditing';
// Components
import BricksButton from '../../ui/base/button/BricksButton.vue';
import BricksTextEditorToolbar from '../../ui/inputs/BricksTextEditorToolbar.vue';
import BricksTooltip from '../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../ui/tooltip/BricksTooltipHint.vue';

const TheTextEditorModal = defineAsyncComponent(() => import('./TheTextEditorModal.vue'));
const TextEditorImageFloatPopover = defineAsyncComponent(
    () => import('./TextEditorImageFloatPopover.vue')
);
// #endregion

// #region Props
const props = withDefaults(defineProps<ITextEditorAreaProps>(), {
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
const emit = defineEmits<ITextEditorAreaEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const inlineEditingStore = useInlineEditingStore();
const $style = useCssModule();
const innerValue = ref<string>(props.value ?? '');
const isClient = ref(false);
const loadingError = ref<unknown | null>(null);

const isCodeView = ref(false);
const isDarkEditorBackground = ref(false);
const isExpandedModalOpen = ref(false);
const editor = shallowRef<Editor | null>(null);
const EditorContentComponent = shallowRef<Component | null>(null);

const { toolbarGroups } = useToolbarStateSync(editor, {
    isEnabled: () => props.useRichEditor !== false && isClient.value,
});
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
    $style.TextEditorArea,
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
                    'data-placeholder': placeholder || t('bricks.textEditor.textPlaceholder'),
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
// #endregion

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
                    <BricksIcon :icon="isCodeView ? 'ph:eye' : 'ph:code'" />
                    <span>{{
                        isCodeView ? t('bricks.textEditor.render') : t('bricks.textEditor.code')
                    }}</span>
                </BricksButton>
            </div>

            <transition name="library-fade" mode="out-in">
                <div v-if="isToolbarVisible" :class="$style.toolbar">
                    <BricksTextEditorToolbar
                        :groups="toolbarGroups"
                        use-tooltips
                        show-image-insert
                        @request-image="handleRequestImage"
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

                    <TextEditorImageFloatPopover :editor="editor" />

                    <BricksTooltip bottom :class="$style.expandButtonWrapper">
                        <template #activator>
                            <button
                                type="button"
                                :class="$style.expandButton"
                                :disabled="props.disabled"
                                @click="isExpandedModalOpen = true"
                            >
                                <BricksIcon icon="ph:arrows-out" />
                            </button>
                        </template>
                        <BricksTooltipHint :text="t('bricks.textEditor.expand')" />
                    </BricksTooltip>

                    <BricksTooltip top :class="$style.backgroundToggleWrapper">
                        <template #activator>
                            <button
                                type="button"
                                :class="[
                                    $style.backgroundToggleButton,
                                    { [$style._active]: isDarkEditorBackground },
                                ]"
                                :disabled="props.disabled"
                                @click="toggleEditorBackground"
                            >
                                <BricksIcon icon="ph:circle-half-tilt" />
                            </button>
                        </template>
                        <BricksTooltipHint :text="t('bricks.textEditor.toolbar.darkBackground')" />
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
                                <BricksIcon icon="ph:arrows-out" />
                            </button>
                        </template>
                        <BricksTooltipHint :text="t('bricks.textEditor.expand')" />
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
.TextEditorArea {
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
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-600);
    user-select: none;
}

.editorWrapper {
    position: relative;

    &._darkPreview {
        :global(.ProseMirror) {
            background-color: var(--bricks-dark-surface);
        }

        .editor {
            border-color: var(--bricks-dark-surface);
            background-color: var(--bricks-dark-surface);
        }

        .fallbackArea {
            border-color: var(--bricks-dark-surface);
            background-color: var(--bricks-dark-surface);
        }
    }
}

.editor {
    /* Фиксируем светлую тему для области ввода контента */
    --bricks-base-0: #fff;
    --bricks-base-300: #d1d5db;
    --bricks-base-900: #111827;

    overflow: hidden;
    min-height: inherit;
    padding: 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    font-size: 1.4rem;
    line-height: 1.6;
    color: var(--bricks-base-900);

    :global(.ProseMirror) {
        min-height: inherit;
        outline: none;

        &:focus {
            border-color: var(--bricks-primary);
        }
    }
}

.fallbackArea {
    /* Фиксируем светлую тему для области ввода контента */
    --bricks-base-0: #fff;
    --bricks-base-300: #d1d5db;
    --bricks-base-900: #111827;

    box-sizing: border-box;
    width: 100%;
    min-height: inherit;
    padding: 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    font-size: 1.4rem;
    line-height: 1.6;
    color: var(--bricks-base-900);
    resize: vertical;
    transition: border-color 0.2s ease;

    &:focus {
        border-color: var(--bricks-primary);
        outline: none;
    }
}

.error {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-danger-600);
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
    box-sizing: border-box;
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    min-width: 0;
    padding: 0.6rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-50);
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
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    color: var(--bricks-base-500);
    transition:
        border-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }

    &:hover {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
    }
}

.backgroundToggleWrapper {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    opacity: 0;
    transition: opacity var(--default-transition);

    .editorWrapper:hover & {
        opacity: 1;
    }
}

.backgroundToggleButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    color: var(--bricks-base-500);
    transition:
        border-color var(--default-transition),
        background var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }

    &:hover {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
    }

    &._active {
        border-color: var(--bricks-primary);
        background: var(--bricks-primary);
        color: #fff;
    }
}
</style>
