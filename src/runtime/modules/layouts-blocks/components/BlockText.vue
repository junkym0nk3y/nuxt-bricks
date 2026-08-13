<script setup lang="ts">
// #region Imports
// Types
import type { IBlockTextProps, IInlineEditingContext } from '../types/blockProps';

// Vue
import { computed, inject, watch, useCssModule } from 'vue';

// Composables
import { useInlineEditor } from '../../text-editor/composables/useInlineEditor';

// Utils
import { sanitizeRichTextHtml } from '../../common/utils/sanitize/sanitizeRichText';
// #endregion

// #region Props
// `fontSize` объявлен, но в стилях не используется: размер приходит
// CSS-переменной `--bricks-text-font-size`, которую выставляет definition на
// обеих поверхностях. Без объявления проп протёк бы в DOM атрибутом `fontsize`
const props = withDefaults(defineProps<IBlockTextProps>(), {
    componentId: '',
    content: '<p>Начните вводить текст...</p>',
    fontSize: undefined,
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

/** Контент схемы — недоверенный ввод: санитизация обязательна перед v-html. */
const sanitizedContent = computed<string>(() => sanitizeRichTextHtml(props.content));
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
        <div v-else data-tiptap-content v-html="sanitizedContent"></div>
    </div>
</template>

<style module lang="scss">
.BlockText {
    // Значение выбирает сгенерированное правило по устройству набора; fallback —
    // базовый размер. Прежние `@container`-запросы убраны: `container-type`
    // объявлен только на `.bricks-canvas`, поэтому на published они не работали
    // вовсе и текст оставался базового размера
    font-size: var(--bricks-text-font-size, 1.8rem);
    line-height: 1.6;

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
