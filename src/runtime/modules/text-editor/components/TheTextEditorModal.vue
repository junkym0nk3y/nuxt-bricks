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
import { useTextEditorLink } from '../composables/useTextEditorLink';
import { useToolbarStateSync } from '../composables/useToolbarStateSync';

// Pinia
import { useInlineEditingStore } from '../stores/inlineEditing';

// Components
import BricksButton from '../../ui/base/button/BricksButton.vue';
import BricksIconButton from '../../ui/base/icon-button/BricksIconButton.vue';
import BricksModal from '../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../ui/base/modal/BricksModalHeader.vue';
import BricksTextEditorToolbar from '../../ui/inputs/BricksTextEditorToolbar.vue';
import TextEditorImageFloatPopover from './TextEditorImageFloatPopover.vue';
import TextEditorLinkModal from './TextEditorLinkModal.vue';
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

const {
    isLinkModalOpen,
    linkValue,
    hasLinkAtSelection,
    openLinkModal,
    applyLink,
    removeLink,
    closeLinkModal,
} = useTextEditorLink(editor);

const { toolbarGroups } = useToolbarStateSync(editor, { onRequestLink: openLinkModal });
// #endregion

// #region Computed
const isToolbarVisible = computed(() => !isCodeView.value && toolbarGroups.value.length > 0);
// #endregion

// #region Methods
/** Initializes the TipTap editor with the full set of extensions */
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

/** Destroys the TipTap editor and releases its resources */
function destroyEditor(): void {
    editor.value?.destroy();
    editor.value = null;
    EditorContentComponent.value = null;
    isCodeView.value = false;
    isDarkEditorBackground.value = false;
}

/** Switches the view between the visual mode and the source */
function toggleCodeView(): void {
    isCodeView.value = !isCodeView.value;

    if (!isCodeView.value && editor.value) {
        editor.value.commands.setContent(codeValue.value, { emitUpdate: false });
    }
}

/** Switches the background of the visual editor between light and dark */
function toggleEditorBackground(): void {
    isDarkEditorBackground.value = !isDarkEditorBackground.value;
}

/** Handles input in the code-view textarea */
function handleCodeInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    codeValue.value = target.value;
}

/** Commits the changes and closes the modal */
function handleDone(): void {
    const html = isCodeView.value ? codeValue.value : (editor.value?.getHTML() ?? codeValue.value);

    emit('update:value', html);
    emit('close');
}

/** Requests media through MediaGallery and inserts it into the editor */
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
        @close="handleDone"
    >
        <div :class="$style.TheTextEditorModal">
            <BricksModalHeader size="lg" @close="handleDone">
                <template #actions>
                    <BricksButton
                        :active="isCodeView"
                        variant="secondary"
                        size="sm"
                        :disabled="props.disabled"
                        :class="$style.codeViewButton"
                        @click="toggleCodeView"
                    >
                        <BricksIcon :icon="isCodeView ? 'ph:eye' : 'ph:code'" />
                        <span>{{
                            isCodeView ? t('bricks.textEditor.render') : t('bricks.textEditor.code')
                        }}</span>
                    </BricksButton>
                </template>
            </BricksModalHeader>

            <transition name="bricks-fade" mode="out-in">
                <div v-if="isToolbarVisible" :class="$style.toolbar">
                    <BricksTextEditorToolbar
                        :groups="toolbarGroups"
                        use-tooltips
                        show-image-insert
                        @request-image="handleRequestImage"
                    />
                </div>
            </transition>

            <div :class="$style.body">
                <transition name="bricks-fade" mode="out-in">
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

                <BricksIconButton
                    v-if="!isCodeView"
                    :class="$style.backgroundToggleWrapper"
                    icon="ph:circle-half-tilt"
                    :label="t('bricks.textEditor.toolbar.darkBackground')"
                    :active="isDarkEditorBackground"
                    :disabled="props.disabled"
                    tooltip-side="top"
                    @click="toggleEditorBackground"
                />
            </div>

            <TextEditorLinkModal
                :is-open="isLinkModalOpen"
                :value="linkValue"
                :can-remove="hasLinkAtSelection"
                layer="nested"
                @apply="applyLink"
                @remove="removeLink"
                @close="closeLinkModal"
            />

            <BricksModalFooter size="lg">
                <BricksButton variant="primary" size="md" @click="handleDone">
                    Готово
                </BricksButton>
            </BricksModalFooter>
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
    box-shadow: var(--bricks-shadow-md);
    flex-direction: column;
}

.codeViewButton {
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

.backgroundToggleWrapper {
    position: absolute;
    right: 1.2rem;
    bottom: 1.2rem;
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
    --bricks-base-0: #fff;
    --bricks-base-300: #d1d5db;
    --bricks-base-900: #111827;
    --bricks-primary: #2563eb;

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
</style>
