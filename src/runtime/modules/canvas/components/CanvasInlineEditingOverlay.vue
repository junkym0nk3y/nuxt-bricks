<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarGroup } from '../../editor/types/text-editor-toolbar.d.ts';
import type { Editor } from '@tiptap/vue-3';

// Vue
import {
    computed,
    ref,
    shallowRef,
    watch,
    watchEffect,
    useCssModule,
    nextTick,
    type Component,
} from 'vue';

// VueUse
import { useElementBounding, useResizeObserver } from '@vueuse/core';

// Nuxt
import { useNuxtApp } from 'nuxt/app';

// Pinia
import { useInlineEditingStore } from '../../editor/stores/inlineEditing';
import { useCanvasStore } from '../../builder/stores/canvas';
import { useComponentsStore } from '../../builder/stores/components';

// Composables
import { useBricksConfig } from '../../common/composables/useBricksConfig';

// Components
import BricksTextEditorToolbar from '../../ui/inputs/BricksTextEditorToolbar.vue';
import TiptapImageFloatPopover from '../../editor/components/TiptapImageFloatPopover.vue';
// #endregion

// #region Data
const $style = useCssModule();
const inlineEditingStore = useInlineEditingStore();
const canvasStore = useCanvasStore();
const componentsStore = useComponentsStore();
const config = useBricksConfig();
const { $textEditorToolbar } = useNuxtApp();

const overlayRef = ref<HTMLElement | null>(null);

/** Размеры overlay — обновляются только при изменении размера (не при скролле) */
const overlaySize = ref({ width: 400, height: 120 });

useResizeObserver(overlayRef, (entries) => {
    const { width, height } = entries[0].contentRect;
    overlaySize.value = { width, height };
});

/**
 * Ref на DOM-элемент редактируемого компонента — для привязки позиции при скролле.
 * В Figma Mode несколько экземпляров одного компонента присутствуют в DOM одновременно,
 * поэтому используем элемент из стора (тот, на котором был dblclick), а не querySelector.
 */
const editingElementRef = computed<HTMLElement | null>(() => inlineEditingStore.editingElement);
const { top: elTop, left: elLeft } = useElementBounding(editingElementRef);

/** Смещение overlay, заданное пользователем через перетаскивание */
const dragOffset = ref({ x: 0, y: 0 });

/** Флаг активного перетаскивания */
const isDragging = ref(false);

/** Состояния для toolbar selects — используются в createToolbarConfig */
const currentFontSize = ref<string>('1.6rem');
const currentFontWeight = ref<string>('');
const currentColor = ref<string>('#000000');
const currentFontFamily = ref<string>('');
const currentLineHeight = ref<string>('');
const currentLetterSpacing = ref<string>('');

/**
 * Счётчик транзакций TipTap для форсирования ре-рендера toolbar
 * (чтобы isActive() кнопок обновлялись при смене выделения/курсора).
 */
const editorTransactionCount = ref<number>(0);

/**
 * Fallback TipTap editor — создаётся overlay, когда ни один layout-компонент
 * не инициализировал свой editor (для story-компонентов с textarea/inline-content).
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
// #endregion

// #region Computed
/**
 * Показывать ли overlay.
 */
const isVisible = computed<boolean>(() => inlineEditingStore.isEditing);

/**
 * Показывать ли TipTap-тулбар (только для textarea типа).
 */
const showToolbar = computed<boolean>(
    () => isVisible.value && inlineEditingStore.propType === 'textarea'
);

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
 * Показывать ли кнопку переключения фона (есть fallback wrapper).
 */
const hasFallbackWrapper = computed<boolean>(() => showFallbackEditor.value);

/**
 * CSS классы для fallback wrapper с поддержкой тёмного фона.
 */
const fallbackWrapperClasses = computed(() => [
    $style.fallbackEditorWrapper,
    {
        [$style._darkPreview]: isDarkEditorBackground.value,
    },
]);

/**
 * Доступные шрифты из конфига.
 */
const availableFonts = computed<string[]>(() => config.fonts || []);

/**
 * Конфигурация групп тулбара.
 * Зависит от editorTransactionCount для ре-рендера при смене выделения.
 */
const toolbarGroups = computed<IToolbarGroup[]>(() => {
    const ed = inlineEditingStore.editor;

    // Включаем счётчик транзакций в условие — это создаёт реактивную зависимость,
    // чтобы computed пересчитывался при каждой транзакции редактора (обновление isActive()).
    // editorTransactionCount никогда не уходит в минус, поэтому поведение не меняется.
    if (!ed || inlineEditingStore.propType !== 'textarea' || editorTransactionCount.value < 0) {
        return [];
    }

    return $textEditorToolbar.createToolbarConfig({
        editor: ed,
        availableFonts: availableFonts.value,
        currentFontSize,
        currentFontWeight,
        currentColor,
        currentFontFamily,
        currentLineHeight,
        currentLetterSpacing,
    });
});

/**
 * Fixed стили позиционирования overlay.
 * Привязан к редактируемому элементу через useElementBounding (следует при скролле).
 * Левый край совпадает с позицией курсора в момент dblclick, верх — над курсором.
 */
const overlayStyle = computed(() => {
    const offset = inlineEditingStore.cursorOffset;
    const GAP = 42;

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

    const overlayH = overlaySize.value.height;
    const overlayW = overlaySize.value.width;

    const cursorY = elTop.value + (offset?.y ?? 0) + dragOffset.value.y;
    const rawLeft = elLeft.value + (offset?.x ?? 0) + dragOffset.value.x;
    const rawTop = cursorY - overlayH - GAP;

    const left = Math.max(GAP, Math.min(vw - overlayW - GAP, rawLeft));

    // Если overlay уходит за верхний край — размещаем ниже курсора
    let top = rawTop < GAP ? cursorY + GAP : rawTop;
    // Ограничиваем снизу и сверху, чтобы overlay всегда оставался в пределах viewport
    top = Math.max(GAP, Math.min(top, vh - overlayH - GAP));

    return {
        position: 'fixed' as const,
        top: `${top}px`,
        left: `${left}px`,
    };
});
// #endregion

// #region Lifecycle
/**
 * Сбрасывает drag-смещение при смене редактируемого компонента.
 */
watch(
    () => inlineEditingStore.componentId,
    () => {
        dragOffset.value = { x: 0, y: 0 };
    },
    { immediate: true }
);

/**
 * Закрывает тулбар, если редактируемый компонент перестал быть выбранным в билдере.
 */
watch(
    () => componentsStore.selectedComponent?.id,
    (selectedId) => {
        if (inlineEditingStore.isEditing && selectedId !== inlineEditingStore.componentId) {
            inlineEditingStore.stopEditing();
        }
    }
);

/**
 * Закрывает тулбар при переключении адаптивов (viewport / Figma mode).
 */
watch(
    () => canvasStore.isViewportSwitching,
    (switching) => {
        if (switching && inlineEditingStore.isEditing) {
            inlineEditingStore.stopEditing();
        }
    }
);

/**
 * При переключении свойства: сбрасываем toolbar state и переинициализируем fallback editor.
 */
watch(
    () => inlineEditingStore.propName,
    (newName, oldName) => {
        if (newName === oldName) {
            return;
        }

        // Сброс toolbar state
        currentFontSize.value = '1.6rem';
        currentFontWeight.value = '';
        currentColor.value = '#000000';
        currentFontFamily.value = '';
        currentLineHeight.value = '';
        currentLetterSpacing.value = '';

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
        }, 300);
    }
);

/**
 * Подписывается на TipTap-транзакции для обновления состояний тулбара.
 * watchEffect автоматически очищает предыдущий listener при смене editor.
 */
watchEffect((onCleanup) => {
    const ed = inlineEditingStore.editor;
    if (!ed) {
        return;
    }

    function handleTransaction(): void {
        editorTransactionCount.value++;
        $textEditorToolbar.syncToolbarState(ed!, {
            currentFontSize,
            currentFontWeight,
            currentColor,
            currentFontFamily,
            currentLineHeight,
            currentLetterSpacing,
        });
    }

    ed.on('transaction', handleTransaction);
    onCleanup(() => {
        ed.off('transaction', handleTransaction);
    });
});
// #endregion

// #region Methods
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

        const [
            { Editor: TiptapEditor, EditorContent },
            { default: StarterKit },
            { default: Underline },
            { TextStyle },
            { default: Color },
            { default: FontFamily },
            { default: TextAlign },
            { FontSize },
            { FontWeight },
            { LineHeight },
            { LetterSpacing },
            { Table, TableRow, TableCell, TableHeader },
            { ResizableImage },
            { ResizableVideo },
            { BoldOverride },
        ] = await Promise.all([
            import('@tiptap/vue-3'),
            import('@tiptap/starter-kit'),
            import('@tiptap/extension-underline'),
            import('@tiptap/extension-text-style'),
            import('@tiptap/extension-color'),
            import('@tiptap/extension-font-family'),
            import('@tiptap/extension-text-align'),
            import('../../editor/tiptap/fontSize'),
            import('../../editor/tiptap/fontWeight'),
            import('../../editor/tiptap/lineHeight'),
            import('../../editor/tiptap/letterSpacing'),
            import('@tiptap/extension-table'),
            import('../../editor/tiptap/resizableImage'),
            import('../../editor/tiptap/resizableVideo'),
            import('../../editor/tiptap/boldOverride'),
        ]);

        fallbackEditorContent.value = EditorContent;

        const ed = new TiptapEditor({
            content: htmlContent,
            extensions: [
                StarterKit.configure({
                    bold: false,
                    bulletList: { keepMarks: true },
                    orderedList: { keepMarks: true },
                }),
                BoldOverride,
                Underline,
                TextStyle,
                Color,
                FontFamily,
                FontSize,
                FontWeight,
                LineHeight,
                LetterSpacing,
                TextAlign.configure({
                    types: ['heading', 'paragraph'],
                    alignments: ['left', 'center', 'right', 'justify'],
                }),
                Table.configure({
                    resizable: false,
                    HTMLAttributes: { class: 'bricks-tiptap-table' },
                }),
                TableRow,
                TableCell,
                TableHeader,
                ResizableImage,
                ResizableVideo,
            ],
            editorProps: {
                attributes: {
                    style: 'outline: none; min-height: 4rem; padding: 0.4rem;',
                },
            },
            onUpdate: saveFallbackToStore,
        });

        fallbackEditor.value = ed;
        inlineEditingStore.setEditor(ed);

        await nextTick();
        ed.commands.focus();
    } catch (error) {
        console.error('[CanvasInlineEditingOverlay] Failed to init fallback editor:', error);
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
 * Переключает на предыдущее свойство.
 */
function handleSwitchPrev(): void {
    if (isFallbackMode.value) {
        saveFallbackToStore();
    }
    inlineEditingStore.switchToPrevProp();
}

/**
 * Переключает на следующее свойство.
 */
function handleSwitchNext(): void {
    if (isFallbackMode.value) {
        saveFallbackToStore();
    }
    inlineEditingStore.switchToNextProp();
}

/**
 * Сохраняет и выходит из inline editing.
 */
function handleDone(): void {
    if (isFallbackMode.value) {
        saveFallbackToStore();
        componentsStore.saveToHistory();
        destroyFallbackEditor();
    }
    inlineEditingStore.stopEditing();
}

/**
 * Запускает перетаскивание overlay по drag handle.
 */
function onDragHandleMousedown(event: MouseEvent): void {
    event.preventDefault();

    isDragging.value = true;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const startX = event.clientX - dragOffset.value.x;
    const startY = event.clientY - dragOffset.value.y;

    function handleMousemove(e: MouseEvent): void {
        dragOffset.value = {
            x: e.clientX - startX,
            y: e.clientY - startY,
        };
    }

    function handleMouseup(): void {
        isDragging.value = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleMousemove);
        document.removeEventListener('mouseup', handleMouseup);
    }

    document.addEventListener('mousemove', handleMousemove);
    document.addEventListener('mouseup', handleMouseup);
}

/**
 * Переключает фон fallback-редактора между светлым и тёмным.
 */
function toggleEditorBackground(): void {
    isDarkEditorBackground.value = !isDarkEditorBackground.value;
}

/**
 * Запрашивает медиа из MediaGallery через inlineEditingStore.
 * При выборе вставляет изображение или видео в TipTap-редактор.
 */
function handleRequestImage(): void {
    const ed = inlineEditingStore.editor;
    if (!ed) {
        return;
    }

    inlineEditingStore.requestMedia((item) => {
        if (item.mimeType.startsWith('video/')) {
            ed.chain().focus().setVideo({ src: item.url }).run();
        } else {
            ed.chain()
                .focus()
                .setImage({
                    src: item.url,
                    alt: item.alt || item.filename,
                })
                .run();
        }
    });
}
// #endregion
</script>

<template>
    <Teleport to="body">
        <Transition name="library-canvas-toolbar">
            <div
                v-if="isVisible && !canvasStore.isViewportSwitching"
                ref="overlayRef"
                :class="[$style.CanvasInlineEditingOverlay, { [$style._dragging]: isDragging }]"
                :style="overlayStyle"
            >
                <!-- Drag handle -->
                <div :class="$style.dragHandle" @mousedown="onDragHandleMousedown">
                    <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor">
                        <circle cx="4" cy="2" r="1.5" />
                        <circle cx="8" cy="2" r="1.5" />
                        <circle cx="12" cy="2" r="1.5" />
                        <circle cx="4" cy="8" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="12" cy="8" r="1.5" />
                    </svg>
                </div>

                <div :class="$style.inlineEditHeader">
                    <div :class="$style.inlineEditTitle">
                        {{ inlineEditingStore.currentPropLabel || 'Инлайн редактор' }}
                    </div>

                    <div
                        v-if="inlineEditingStore.editablePropsCount > 1"
                        :class="$style.propSwitcher"
                    >
                        <button
                            :disabled="!inlineEditingStore.canSwitchPrev"
                            :class="$style.switchButton"
                            @mousedown.prevent
                            @click="handleSwitchPrev"
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M7.5 9L4.5 6L7.5 3" />
                            </svg>
                        </button>
                        <span :class="$style.propCounter">
                            {{ inlineEditingStore.currentPropIndex + 1 }}/{{
                                inlineEditingStore.editablePropsCount
                            }}
                        </span>
                        <button
                            :disabled="!inlineEditingStore.canSwitchNext"
                            :class="$style.switchButton"
                            @mousedown.prevent
                            @click="handleSwitchNext"
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M4.5 3L7.5 6L4.5 9" />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- TipTap Toolbar (только для textarea-типа или fallback wrapper) -->
                <BricksTextEditorToolbar
                    v-if="(showToolbar && toolbarGroups.length > 0) || hasFallbackWrapper"
                    :groups="toolbarGroups"
                    compact
                    use-tooltips
                    :show-image-insert="showToolbar && toolbarGroups.length > 0"
                    :show-background-toggle="
                        showToolbar && toolbarGroups.length > 0 && hasFallbackWrapper
                    "
                    :is-dark-background="isDarkEditorBackground"
                    @request-image="handleRequestImage"
                    @toggle-background="toggleEditorBackground"
                />

                <!-- Fallback TipTap editor (для story-компонентов с textarea/inline-content) -->
                <div v-if="showFallbackEditor" :class="fallbackWrapperClasses">
                    <component :is="fallbackEditorContent!" :editor="fallbackEditor!" />
                </div>

                <!-- Footer: Done button + hint -->
                <div :class="$style.footer">
                    <button type="button" :class="$style.doneButton" @click="handleDone">
                        Готово
                    </button>
                    <span :class="$style.hint">Esc — выйти</span>
                </div>
            </div>
        </Transition>

        <TiptapImageFloatPopover :editor="inlineEditingStore.editor" />
    </Teleport>
</template>

<style module lang="scss">
.CanvasInlineEditingOverlay {
    z-index: 1;
    overflow: hidden;
    display: flex;
    width: 46rem;
    min-width: 22rem;
    max-width: 80rem;
    padding: 0.6rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    resize: horizontal;
    flex-direction: column;
    gap: 0.4rem;
    box-shadow: var(--shadow-md);
    pointer-events: auto;
    transition:
        opacity var(--default-transition),
        box-shadow var(--default-transition);

    &._dragging {
        box-shadow: var(--shadow-lg);
        opacity: 0.6;
    }
}

.dragHandle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    height: 1.8rem;
    border-radius: var(--border-radius-xs);
    color: var(--bricks-base-300);
    transition:
        background var(--default-transition),
        color var(--default-transition);
    cursor: grab;
    user-select: none;

    &:hover {
        background: var(--bricks-base-100);
        color: var(--bricks-base-500);
    }
}

.inlineEditHeader {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
}

.inlineEditTitle {
    text-align: center;
    font-size: 1.2rem;
    user-select: none;
}

.propSwitcher {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
}

.switchButton {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--border-radius-xs);
    border: none;
    background: transparent;
    color: var(--bricks-base-600);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--bricks-base-100);
        color: var(--bricks-base-900);
    }

    &:disabled {
        opacity: 0.3;
        cursor: default;
    }
}

.propCounter {
    white-space: nowrap;
    font-size: 1.1rem;
    color: var(--bricks-base-500);
    user-select: none;
}

.footer {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--bricks-base-200);
}

.doneButton {
    padding: 0.3rem 1rem;
    border-radius: var(--border-radius-xs);
    border: none;
    background: var(--bricks-primary);
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 600;
    color: #fff;
    transition: opacity var(--default-transition);
    cursor: pointer;

    &:hover {
        opacity: 0.85;
    }
}

.hint {
    white-space: nowrap;
    font-size: 1.1rem;
    color: var(--bricks-base-500);
}

.fallbackEditorWrapper {
    --bricks-base-0: #fff;

    overflow-y: auto;
    max-height: 20rem;
    padding: 0.4rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    background-color: var(--bricks-base-0);
    font-size: 1.4rem;
    line-height: 1.5;
    color: initial;

    :global(.ProseMirror) {
        min-height: 4rem;
        outline: none;
    }

    &._darkPreview {
        border-color: #212226;
        background: #212226;

        :global(.ProseMirror) {
            background: #212226;
        }
    }
}
</style>
