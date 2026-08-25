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
// `fontSize` is declared but unused in the styles: the size arrives as the
// `--bricks-text-font-size` CSS variable, which the definition sets on both surfaces,
// and the generated rule picks the value of the current device with a fallback to the
// base size. Without the declaration the prop would leak into the DOM as a `fontsize`
// attribute
const props = withDefaults(defineProps<IBlockTextProps>(), {
    componentId: '',
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
 * Checks whether inline editing is active for this component.
 */
const isEditing = computed<boolean>(() => {
    if (!inlineEditingContext || !props.componentId) {
        return false;
    }
    return inlineEditingContext.isEditing.value;
});

/** Schema content is untrusted input: sanitizing is mandatory before v-html */
const sanitizedContent = computed<string>(() => sanitizeRichTextHtml(props.content));
// #endregion

// #region Lifecycle
// The full target is watched (this component AND this property), and synchronously: a
// stop and a start of the editing inside one tick collapse into a single unchanged
// value under the default flush, and then the only initialization ever started would
// be the one of the session already over — publishing an editor filled with the text
// as it was before the restart
watch(
    () => inlineEditor?.isActive.value ?? false,
    async (isTargetActive) => {
        if (isTargetActive && inlineEditor) {
            await inlineEditor.initEditor();
        }
    },
    { flush: 'sync' }
);
// #endregion

// #region Methods
/**
 * Stops a click inside the editor from bubbling.
 *
 * @param event - Click event.
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
        <template
            v-if="isEditing && inlineEditor?.editor.value && inlineEditor?.editorContent.value"
        >
            <component
                :is="inlineEditor.editorContent.value"
                :editor="inlineEditor.editor.value"
                :class="$style.editorContent"
            />
        </template>

        <div v-else data-tiptap-content v-html="sanitizedContent"></div>
    </div>
</template>

<style module lang="scss">
.BlockText {
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
