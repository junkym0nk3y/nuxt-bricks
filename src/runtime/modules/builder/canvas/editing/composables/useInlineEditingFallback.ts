// Types
import type { Editor } from '@tiptap/vue-3';
import type { IInlineEditingFallbackOptions } from '../../types/composables';

// Vue
import { ref, shallowRef, computed, watch, nextTick, type Component } from 'vue';

// Pinia
import { useInlineEditingStore } from '../../../../text-editor/stores/inlineEditing';
import { useComponentsStore } from '../../../core/stores/components';

// Utils
import { createTiptapEditor } from '../../../../text-editor/utils/createTiptapEditor';

/** How long to wait for an editor from a layout component before building the fallback */
const FALLBACK_INIT_DELAY_MS = 300;

/**
 * Lifecycle of the fallback TipTap editor inside the inline editing overlay: created
 * when no layout component initialized an editor of its own (brick components with
 * textarea or inline-content), saves the value into the components store, and is
 * rebuilt when the edited property is switched.
 */
export function useInlineEditingFallback(options: IInlineEditingFallbackOptions = {}) {
    const inlineEditingStore = useInlineEditingStore();
    const componentsStore = useComponentsStore();

    /**
     * Fallback TipTap editor.
     * shallowRef, because a TipTap Editor must not be made deeply reactive.
     */
    const fallbackEditor = shallowRef<Editor | null>(null);

    /**
     * The EditorContent component that renders the fallback editor in the template.
     */
    const fallbackEditorContent = shallowRef<Component | null>(null);

    /**
     * Whether the fallback editor is in use (the overlay built an editor of its own).
     */
    const isFallbackMode = ref(false);

    /**
     * Dark background of the fallback editor.
     */
    const isDarkEditorBackground = ref(false);

    /** Timer that waits for an editor to be initialized by a layout component */
    let fallbackInitTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Whether to show the fallback EditorContent in the overlay (for brick components).
     */
    const showFallbackEditor = computed<boolean>(
        () =>
            isFallbackMode.value &&
            fallbackEditor.value !== null &&
            fallbackEditorContent.value !== null
    );

    /**
     * Reads the current value of the edited property from the store.
     */
    function getCurrentPropValue(): unknown {
        const cId = inlineEditingStore.componentId;
        const pName = inlineEditingStore.propName;
        if (!cId || !pName) {
            return undefined;
        }
        const component = componentsStore.getComponentById(cId);
        if (!component?.props) {
            return undefined;
        }
        return (component.props as Record<string, unknown>)[pName];
    }

    /**
     * Saves the value of the fallback editor into the store.
     */
    function saveFallbackToStore(): void {
        const cId = inlineEditingStore.componentId;
        const pName = inlineEditingStore.propName;
        if (!cId || !pName) {
            return;
        }

        if (fallbackEditor.value) {
            const html = fallbackEditor.value.getHTML();
            componentsStore.updateComponentProp(cId, pName, html);
        }
    }

    /**
     * Initializes the fallback TipTap editor for a textarea-typed property.
     * Called when no layout component created an editor of its own.
     */
    async function initFallbackTiptapEditor(): Promise<void> {
        try {
            const currentValue = getCurrentPropValue();
            const htmlContent = typeof currentValue === 'string' ? currentValue : '';

            const { editor: ed, EditorContent } = await createTiptapEditor({
                content: htmlContent,
                editorProps: {
                    attributes: {
                        style: 'outline: none; min-height: 4rem; padding: 0.4rem;',
                    },
                },
                onUpdate: saveFallbackToStore,
            });

            fallbackEditorContent.value = EditorContent;
            fallbackEditor.value = ed;
            inlineEditingStore.setEditor(ed);

            await nextTick();
            ed.commands.focus();
        } catch (error) {
            console.error('[useInlineEditingFallback] Failed to init fallback editor:', error);
        }
    }

    /**
     * Tears the fallback editor down.
     */
    function destroyFallbackEditor(): void {
        if (fallbackInitTimer) {
            clearTimeout(fallbackInitTimer);
            fallbackInitTimer = null;
        }

        if (fallbackEditor.value) {
            fallbackEditor.value.destroy();
            fallbackEditor.value = null;
        }
        fallbackEditorContent.value = null;
        isFallbackMode.value = false;
        isDarkEditorBackground.value = false;
    }

    /**
     * Switches the background of the fallback editor between light and dark.
     */
    function toggleEditorBackground(): void {
        isDarkEditorBackground.value = !isDarkEditorBackground.value;
    }

    /**
     * On a property switch: notifies the caller (which resets the toolbar state) and
     * rebuilds the fallback editor.
     */
    watch(
        () => inlineEditingStore.propName,
        (newName, oldName) => {
            if (newName === oldName) {
                return;
            }

            options.onPropSwitch?.();

            // Rebuild the fallback editor for the newly selected property
            if (!isFallbackMode.value || !inlineEditingStore.isEditing) {
                return;
            }

            destroyFallbackEditor();
            isFallbackMode.value = true;
            initFallbackTiptapEditor();
        }
    );

    /**
     * Fallback: if editing is active but the editor is still null once the delay is out,
     * no layout component created one, so the overlay builds its own.
     */
    watch(
        () => inlineEditingStore.isEditing,
        (editing) => {
            if (!editing) {
                if (isFallbackMode.value) {
                    saveFallbackToStore();
                    componentsStore.saveToHistory();
                }
                destroyFallbackEditor();
                return;
            }

            fallbackInitTimer = setTimeout(() => {
                fallbackInitTimer = null;

                // A layout component already created an editor — no fallback needed
                if (inlineEditingStore.editor) {
                    return;
                }

                isFallbackMode.value = true;
                const pType = inlineEditingStore.propType;

                if (pType === 'textarea' || pType === 'inline-content') {
                    initFallbackTiptapEditor();
                }
            }, FALLBACK_INIT_DELAY_MS);
        }
    );

    return {
        isFallbackMode,
        fallbackEditor,
        fallbackEditorContent,
        showFallbackEditor,
        isDarkEditorBackground,
        toggleEditorBackground,
        saveFallbackToStore,
        destroyFallbackEditor,
    };
}
