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

/** Время ожидания editor от layout-компонента перед созданием fallback. */
const FALLBACK_INIT_DELAY_MS = 300;

/**
 * Lifecycle fallback TipTap-редактора в inline editing overlay: создаётся, когда
 * ни один layout-компонент не инициализировал свой editor (story-компоненты
 * с textarea/inline-content), сохраняет значение в components store,
 * переинициализируется при переключении свойства.
 */
export function useInlineEditingFallback(options: IInlineEditingFallbackOptions = {}) {
    const inlineEditingStore = useInlineEditingStore();
    const componentsStore = useComponentsStore();

    /**
     * Fallback TipTap editor.
     * shallowRef — TipTap Editor нельзя делать глубоко реактивным.
     */
    const fallbackEditor = shallowRef<Editor | null>(null);

    /**
     * Компонент EditorContent для рендеринга fallback-редактора в template.
     */
    const fallbackEditorContent = shallowRef<Component | null>(null);

    /**
     * Флаг — используется ли fallback-редактор (overlay создал свой editor).
     */
    const isFallbackMode = ref(false);

    /**
     * Тёмный фон для fallback-редактора.
     */
    const isDarkEditorBackground = ref(false);

    /** Таймер для ожидания инициализации editor из layout-компонента */
    let fallbackInitTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Показывать ли fallback EditorContent в overlay (для story-компонентов).
     */
    const showFallbackEditor = computed<boolean>(
        () =>
            isFallbackMode.value &&
            fallbackEditor.value !== null &&
            fallbackEditorContent.value !== null
    );

    /**
     * Получает текущее значение редактируемого свойства из store.
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
     * Сохраняет значение fallback-редактора в store.
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
     * Инициализирует fallback TipTap editor для textarea-типа.
     * Вызывается когда layout-компонент не создал свой editor.
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
     * Очищает fallback-редактор.
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
     * Переключает фон fallback-редактора между светлым и тёмным.
     */
    function toggleEditorBackground(): void {
        isDarkEditorBackground.value = !isDarkEditorBackground.value;
    }

    /**
     * При переключении свойства: уведомляет вызывающего (сброс toolbar state)
     * и переинициализирует fallback editor.
     */
    watch(
        () => inlineEditingStore.propName,
        (newName, oldName) => {
            if (newName === oldName) {
                return;
            }

            options.onPropSwitch?.();

            // Переинициализация fallback editor при переключении свойства
            if (!isFallbackMode.value || !inlineEditingStore.isEditing) {
                return;
            }

            destroyFallbackEditor();
            isFallbackMode.value = true;
            initFallbackTiptapEditor();
        }
    );

    /**
     * Fallback: если editing активен, но через 300ms editor всё ещё null —
     * ни один layout-компонент не создал editor → создаём fallback в overlay.
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

                // Layout-компонент уже создал editor — fallback не нужен
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
