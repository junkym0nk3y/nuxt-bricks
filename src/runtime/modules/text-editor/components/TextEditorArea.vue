<script setup lang="ts">
// #region Imports
// Types
import type { ITextEditorAreaProps, ITextEditorAreaEmits } from './types.d.ts';

// Vue
import { computed, defineAsyncComponent, ref, useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useTextEditorArea } from '../composables/useTextEditorArea';

// Components
import BricksButton from '../../ui/base/button/BricksButton.vue';
import BricksIconButton from '../../ui/base/icon-button/BricksIconButton.vue';
import BricksTextEditorToolbar from '../../ui/inputs/BricksTextEditorToolbar.vue';

const TheTextEditorModal = defineAsyncComponent(() => import('./TheTextEditorModal.vue'));
const TextEditorLinkModal = defineAsyncComponent(() => import('./TextEditorLinkModal.vue'));
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
const $style = useCssModule();
const isExpandedModalOpen = ref(false);

const {
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
    handleTextareaInput,
    handleModalUpdate,
    handleRequestImage,
    link,
} = useTextEditorArea(props, emit);

// Unwrap the refs of the link modal: nested inside an object they are not unwrapped
// in the template, and every access would go through `.value`
const { isLinkModalOpen, linkValue, hasLinkAtSelection, applyLink, removeLink, closeLinkModal } =
    link;
// #endregion

// #region Computed
/** Inline style of the editor (its minimum height) */
const editorStyles = computed(() => ({
    minHeight: `${props.minHeight}px`,
}));

/** CSS classes of the wrapper element */
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

// #region Methods
/** Closes the modal editor */
function handleModalClose(): void {
    isExpandedModalOpen.value = false;
}
// #endregion
</script>

<template>
    <div :class="wrapperClasses">
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
        </div>

        <template v-if="props.useRichEditor !== false">
            <transition name="bricks-fade" mode="out-in">
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

                    <BricksIconButton
                        :class="$style.expandButtonWrapper"
                        icon="ph:arrows-out"
                        :label="t('bricks.textEditor.expand')"
                        :disabled="props.disabled"
                        @click="isExpandedModalOpen = true"
                    />

                    <BricksIconButton
                        :class="$style.backgroundToggleWrapper"
                        icon="ph:circle-half-tilt"
                        :label="t('bricks.textEditor.toolbar.darkBackground')"
                        :active="isDarkEditorBackground"
                        :disabled="props.disabled"
                        tooltip-side="top"
                        @click="toggleEditorBackground"
                    />
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

                    <BricksIconButton
                        :class="$style.expandButtonWrapper"
                        icon="ph:arrows-out"
                        :label="t('bricks.textEditor.expand')"
                        :disabled="props.disabled"
                        @click="isExpandedModalOpen = true"
                    />
                </div>
            </transition>
        </template>

        <textarea
            v-else
            :class="$style.fallbackArea"
            :disabled="props.disabled"
            :placeholder="props.placeholder"
            :style="editorStyles"
            :value="innerValue"
            @input="handleTextareaInput"
        ></textarea>

        <p v-if="loadingError" :class="$style.error">
            {{ t('bricks.textEditor.loadFailedFallback') }}
        </p>

        <TheTextEditorModal
            :is-open="isExpandedModalOpen"
            :value="innerValue"
            :disabled="props.disabled"
            @update:value="handleModalUpdate"
            @close="handleModalClose"
        />

        <TextEditorLinkModal
            :is-open="isLinkModalOpen"
            :value="linkValue"
            :can-remove="hasLinkAtSelection"
            @apply="applyLink"
            @remove="removeLink"
            @close="closeLinkModal"
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
    --bricks-base-0: #fff;
    --bricks-base-300: #d1d5db;
    --bricks-base-900: #111827;
    --bricks-primary: #2563eb;

    overflow: hidden;
    min-height: inherit;
    padding: 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
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
    --bricks-base-0: #fff;
    --bricks-base-300: #d1d5db;
    --bricks-base-900: #111827;
    --bricks-primary: #2563eb;

    box-sizing: border-box;
    width: 100%;
    min-height: inherit;
    padding: 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
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
    border-radius: var(--bricks-border-radius-sm);
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
    transition: opacity var(--bricks-default-transition);

    .editorWrapper:hover & {
        opacity: 1;
    }
}

.backgroundToggleWrapper {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    opacity: 0;
    transition: opacity var(--bricks-default-transition);

    .editorWrapper:hover & {
        opacity: 1;
    }
}
</style>
