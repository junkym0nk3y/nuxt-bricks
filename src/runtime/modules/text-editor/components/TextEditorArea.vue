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
import BricksTextEditorToolbar from '../../ui/inputs/BricksTextEditorToolbar.vue';
import BricksTooltip from '../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../ui/tooltip/BricksTooltipHint.vue';

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

// Разворачиваем ref-ы модалки ссылки: вложенные в объект они не разворачиваются
// в шаблоне, и обращение шло бы через `.value`
const { isLinkModalOpen, linkValue, hasLinkAtSelection, applyLink, removeLink, closeLinkModal } =
    link;
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

// #region Methods
/**
 * Закрывает модальный редактор.
 */
function handleModalClose(): void {
    isExpandedModalOpen.value = false;
}
// #endregion
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

        <!-- Editor Content / Code View -->
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

        <!-- Форма ссылки для редактора в панели свойств -->
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
    /* Фиксируем светлую тему для области ввода контента.
       primary — тоже: им красится ссылка, а фон здесь всегда белый, и тёмный
       вариант токена дал бы на нём заметно более тусклую ссылку */
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
    /* Фиксируем светлую тему для области ввода контента.
       primary — тоже: им красится ссылка, а фон здесь всегда белый, и тёмный
       вариант токена дал бы на нём заметно более тусклую ссылку */
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

.expandButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    color: var(--bricks-base-500);
    transition:
        border-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
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
    transition: opacity var(--bricks-default-transition);

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
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    color: var(--bricks-base-500);
    transition:
        border-color var(--bricks-default-transition),
        background var(--bricks-default-transition),
        color var(--bricks-default-transition);
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
