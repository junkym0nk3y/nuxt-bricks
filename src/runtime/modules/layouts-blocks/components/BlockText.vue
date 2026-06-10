<script setup lang="ts">
// #region Imports
// Types
import type { InlineEditingPropType } from '../../editor/stores/inlineEditing';

// Vue
import { computed, inject, watch, useCssModule, type ComputedRef } from 'vue';

// Composables
import { useInlineEditor } from '../../editor/composables/useInlineEditor';
// #endregion

// #region Interfaces
interface ILandingTextProps {
    componentId?: string;
    content?: string;
    marginTop?: string | number;
    marginBottom?: string | number;
}

interface IInlineEditingContext {
    componentId: ComputedRef<string | null>;
    propName: ComputedRef<string | null>;
    propType: ComputedRef<InlineEditingPropType | null>;
    isEditing: ComputedRef<boolean>;
}
// #endregion

// #region Props
const props = withDefaults(defineProps<ILandingTextProps>(), {
    componentId: '',
    content: '<p>Начните вводить текст...</p>',
    marginTop: 0,
    marginBottom: 0,
});
// #endregion

// #region Data
const $style = useCssModule();

const inlineEditingContext = inject<IInlineEditingContext | null>('inlineEditingContext', null);

const inlineEditor = props.componentId
    ? useInlineEditor({
          componentId: props.componentId,
          propName: 'content',
          propType: 'textarea',
      })
    : null;
// #endregion

// #region Computed
const textStyle = computed(() => ({
    marginTop: typeof props.marginTop === 'number' ? `${props.marginTop}rem` : props.marginTop,
    marginBottom:
        typeof props.marginBottom === 'number' ? `${props.marginBottom}rem` : props.marginBottom,
}));

/**
 * Проверяет, активен ли inline-editing для этого компонента.
 */
const isEditing = computed<boolean>(() => {
    if (!inlineEditingContext || !props.componentId) {
        return false;
    }
    return inlineEditingContext.isEditing.value;
});
// #endregion

// #region Lifecycle
watch(isEditing, async (editing) => {
    if (editing && inlineEditor) {
        await inlineEditor.initEditor();
    }
});
// #endregion

// #region Methods
/**
 * Предотвращает всплытие клика внутри редактора.
 *
 * @param event - Событие клика.
 */
function handleEditorClick(event: MouseEvent): void {
    event.stopPropagation();
}
// #endregion
</script>

<template>
    <div
        :class="[$style.BlockText, 'bricks-text', { [$style.isEditing]: isEditing }]"
        :style="textStyle"
        @click.stop="isEditing ? handleEditorClick($event) : undefined"
    >
        <!-- Inline editing mode: TipTap -->
        <template
            v-if="isEditing && inlineEditor?.editor.value && inlineEditor?.editorContent.value"
        >
            <component
                :is="inlineEditor.editorContent.value"
                :editor="inlineEditor.editor.value"
                :class="$style.editorContent"
            />
        </template>

        <!-- Normal mode: static HTML -->
        <div v-else data-tiptap-content v-html="props.content"></div>
    </div>
</template>

<style module lang="scss">
.BlockText {
    font-size: 1.4rem;
    line-height: 1.6;

    @container (min-width: 768px) {
        font-size: 1.6rem;
    }

    @container (min-width: 1024px) {
        font-size: 1.8rem;
    }

    &.isEditing {
        cursor: text;
    }
}

.editorContent {
    :global(.ProseMirror) {
        min-height: 2rem;
        outline: none;
    }
}
</style>
