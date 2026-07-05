<script setup lang="ts">
// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';

// Vue
import { ref, shallowRef, computed, watch, onBeforeUnmount, type Component } from 'vue';
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
import BricksCloseButton from '../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../ui/base/modal/BricksModal.vue';
import BricksTextEditorToolbar from '../../ui/inputs/BricksTextEditorToolbar.vue';
import TextEditorImageFloatPopover from './TextEditorImageFloatPopover.vue';
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
const { t } = useI18n();
const inlineEditingStore = useInlineEditingStore();

const editor = shallowRef<Editor | null>(null);
const EditorContentComponent = shallowRef<Component | null>(null);
const isCodeView = ref(false);
const isDarkEditorBackground = ref(false);
const codeValue = ref('');

const { toolbarGroups } = useToolbarStateSync(editor);
// #endregion

// #region Computed
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

    const { editor: createdEditor, EditorContent } = await createTiptapEditor({
        content: props.value,
        editable: !props.disabled,
        onUpdate: ({ editor: instance }) => {
            codeValue.value = instance.getHTML();
        },
    });

    EditorContentComponent.value = EditorContent;
    editor.value = createdEditor;

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

    inlineEditingStore.requestMedia((item) => insertMediaIntoEditor(currentEditor, item));
}
// #endregion

// #region Lifecycle
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
        :title="t('bricks.textEditor.editorTitle')"
        :z-index="10000"
        @close="handleDone"
    >
        <div :class="$style.TheTextEditorModal">
            <!-- Header -->
            <div :class="$style.header">
                <h2 :class="$style.title">{{ t('bricks.textEditor.editorTitle') }}</h2>

                <div :class="$style.headerActions">
                    <BricksButton
                        :active="isCodeView"
                        variant="secondary"
                        size="sm"
                        :disabled="props.disabled"
                        @click="toggleCodeView"
                    >
                        <BricksIcon :icon="isCodeView ? 'ph:eye' : 'ph:code'" />
                        <span>{{
                            isCodeView ? t('bricks.textEditor.render') : t('bricks.textEditor.code')
                        }}</span>
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
                        @request-image="handleRequestImage"
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

                        <TextEditorImageFloatPopover :editor="editor" />
                    </div>
                    <div v-else :class="$style.editorWrapper">
                        <textarea
                            :class="[$style.codeArea]"
                            :disabled="props.disabled"
                            :value="codeValue"
                            spellcheck="false"
                            :placeholder="t('bricks.textEditor.htmlPlaceholder')"
                            @input="handleCodeInput"
                        />
                    </div>
                </transition>

                <button
                    v-if="!isCodeView"
                    type="button"
                    :title="t('bricks.textEditor.toolbar.darkBackground')"
                    :class="[
                        $style.backgroundToggleButton,
                        { [$style._active]: isDarkEditorBackground },
                    ]"
                    :disabled="props.disabled"
                    @click="toggleEditorBackground"
                >
                    <BricksIcon icon="ph:circle-half-tilt" />
                </button>
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
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
    min-height: 0;
}

.backgroundToggleButton {
    position: absolute;
    right: 1.2rem;
    bottom: 1.2rem;
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

.editorWrapper {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;

    &._darkPreview {
        :global(.ProseMirror) {
            background-color: var(--bricks-dark-surface);
        }

        .editor {
            background-color: var(--bricks-dark-surface);
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
