<script setup lang="ts">
// #region Imports
// Types
import type { IDragComposableCanvas } from '../../types/components';
import type { TDropFlowEntry } from '../../../core/types/drag';

// Vue
import { ref, computed, inject, provide, onMounted, onBeforeUnmount, nextTick } from 'vue';

// VueUse
import { useDebounceFn } from '@vueuse/core';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useSidebarStore } from '../../../core/stores/sidebar';
import { usePublishStore } from '../../../publish/stores/publish';

// Composables
import { useCanvas } from '../composables/useCanvas';
import { useBricksConfig } from '../../../../common/composables/useBricksConfig';
import { useCanvasDrops } from '../composables/useCanvasDrops';
import { useCanvasDragAutoScroll } from '../composables/useCanvasDragAutoScroll';
import { useCanvasPan } from '../composables/useCanvasPan';
import { useCanvasWheel } from '../composables/useCanvasWheel';
import { useCanvasCentering } from '../composables/useCanvasCentering';
import { useCanvasContainerMetrics } from '../composables/useCanvasContainerMetrics';
import { useCanvasFlowGuard } from '../composables/useCanvasFlowGuard';
import { useInteractivePreviewDismiss } from '../composables/useInteractivePreviewDismiss';

// Utils
import { convertPxToRem } from '../../../../common/utils/main';
import { buildDropFlowEntries, getDragPlaceholderVars } from '../../../core/utils/dragVisuals';

// Constants
import {
    CANVAS_DRAG_ACTIVE_KEY,
    CANVAS_VIEWPORT_KEY,
    INLINE_EDITOR_HOST_KEY,
} from '../../../../common/constants/injectionKeys';
import { scrollToComponentOnCanvas } from '../../../core/utils/scrollToComponent';

// Components
import BuilderCanvasItem from '../../item/components/BuilderCanvasItem.vue';
import BuilderCanvasBottomBar from './BuilderCanvasBottomBar.vue';
import BuilderCanvasDropPlaceholder from './BuilderCanvasDropPlaceholder.vue';
import BuilderCanvasEmptyState from './BuilderCanvasEmptyState.vue';
import BuilderCanvasViewport from './BuilderCanvasViewport.vue';
import BuilderCanvasInlineEditingOverlay from '../../editing/components/BuilderCanvasInlineEditingOverlay.vue';
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();
const config = useBricksConfig();
const {
    canvasContainer,
    canvasTransform,
    figmaBaseTransform,
    canvasContainerStyle,
    canvasWrapperStyle,
    figmaWrapperMinWidth,
    figmaGap,
    getRemCompensation,
    handleResize,
    resetZoom,
} = useCanvas();

const dragComposable = inject<IDragComposableCanvas | undefined>('dragComposable');
const isCanvasDragActive = computed<boolean>(() => canvasStore.dragState.source !== null);

provide(
    'showGrid',
    computed(() => canvasStore.showGrid)
);

provide(CANVAS_DRAG_ACTIVE_KEY, isCanvasDragActive);

/** Активный viewport для обычного режима (в Figma mode перекрывается BuilderCanvasViewport) */
provide(
    CANVAS_VIEWPORT_KEY,
    computed(() => canvasStore.viewport)
);

/** Rem-компенсация для per-viewport scaling в Figma Mode */
provide('getRemCompensation', getRemCompensation);

/** Порт inline editing к стору компонентов (text-editor не импортирует builder/core) */
provide(INLINE_EDITOR_HOST_KEY, {
    getPropValue: (componentId, propName) => {
        const component = componentsStore.getComponentById(componentId);
        return (component?.props as Record<string, unknown> | undefined)?.[propName];
    },
    updateProp: (componentId, propName, value) => {
        componentsStore.updateComponentProp(componentId, propName, value);
    },
    commitHistory: () => {
        componentsStore.saveToHistory();
    },
});

const canvasRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const canvasWrapperRef = ref<HTMLElement | null>(null);
const isMounted = ref(false);

const {
    rootDropIndex,
    isRootPlaceholderContained,
    handleRootDragEnter,
    handleRootDragOver,
    handleRootDragLeave,
    handleCanvasDrop,
    handleCanvasDragOver,
    handleLayoutDrop,
    handleSlotDrop,
} = useCanvasDrops({
    dragComposable,
    componentsStore,
    canvasRef,
    containerRef,
});

// Зум и смена viewport двигают блоки на экране, не меняя порядок, — на это время
// move-переходы потока выключаются, иначе канвас дрожит.
useCanvasFlowGuard(canvasRef);

// Нативный драг забирает колесо себе — канвас подкручиваем сами, пока курсор у края
useCanvasDragAutoScroll(canvasContainer);

const { isPanning, handleCanvasAreaPointerDown } = useCanvasPan(canvasContainer);

const { zoomInAtCenter, zoomOutAtCenter } = useCanvasWheel(canvasContainer);

const { scheduleCanvasCenter } = useCanvasCentering(canvasContainer);

const { updateContainerMetrics, initMetricsObserver } = useCanvasContainerMetrics({
    containerRef,
    scheduleCanvasCenter,
    scrollToSelected: scrollToSelectedAfterViewportSwitch,
});

useInteractivePreviewDismiss();
// #endregion

// #region Computed
/**
 * Вычисляет отступ левого сайдбара для позиционирования toolbar
 * @returns Ширина левого сайдбара если он видимый, иначе '0px'
 */
const leftSidebarOffset = computed(() => {
    return sidebarStore.left.visible ? sidebarStore.left.width : '0px';
});

/**
 * Вычисляет отступ правой панели свойств для позиционирования toolbar
 * @returns Ширина правой панели если она видима, иначе '0px'
 */
const rightSidebarOffset = computed(() => {
    return sidebarStore.right.visible ? sidebarStore.right.width : '0px';
});

/**
 * Формирует стили для canvas элемента
 *
 * Базовые стили:
 * - width/height из canvasStore
 * - backgroundColor из настроек публикации
 * - fontFamily из конфига
 *
 * Динамические стили (только после монтирования):
 * - transform для масштабирования канваса
 *
 * @returns Объект стилей для canvas элемента
 */
const canvasStyle = computed<Record<string, string>>(() => {
    const baseStyle = {
        width: convertPxToRem(canvasStore.width),
        height: convertPxToRem(canvasStore.height),
        backgroundColor: publishStore.currentFormState.backgroundColor || 'var(--bricks-base-0)',
        fontFamily: config.defaultFont,
        ...getDragPlaceholderVars(canvasStore.dragState),
    };

    if (!isMounted.value) {
        // Не применяем динамические стили при SSR
        return baseStyle;
    }

    return {
        ...baseStyle,
        transform: canvasTransform.value,
    };
});

/** Root-поток: блоки страницы и место вставки одним keyed-списком для TransitionGroup. */
const rootFlowEntries = computed<TDropFlowEntry[]>(() =>
    buildDropFlowEntries(componentsStore.getRootComponents(), rootDropIndex.value, 'root-drop')
);

/**
 * Стили для обёртки Figma Mode — базовый scale без rem-компенсации.
 * Per-viewport компенсация применяется внутри каждого BuilderCanvasViewport.
 */
const figmaWrapperStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};

    if (isMounted.value) {
        style.transform = figmaBaseTransform.value;
        style.gap = figmaGap;
    }

    return style;
});
// #endregion

// #region Methods
/**
 * Debounced обработчик изменения размера окна
 * Пересчитывает масштаб канваса и центрирует его по горизонтали
 * Задержка 150мс для оптимизации производительности при resize
 */
const debouncedResize = useDebounceFn(() => {
    handleResize();
    scheduleCanvasCenter('auto');
}, 150);

/**
 * Сбрасывает текущий выбор, если пользователь кликнул по пустому месту канваса.
 *
 * @param event - Событие клика по канвасу.
 */
function handleCanvasClick(event: MouseEvent): void {
    if (event.target === canvasRef.value) {
        componentsStore.deselectComponent();
    }
}

/**
 * Скроллит до выбранного компонента после смены viewport.
 * Если компонент скрыт на новом viewport (deviceVisibility) — снимает выделение.
 */
function scrollToSelectedAfterViewportSwitch(): void {
    const selected = componentsStore.selectedComponent;
    if (!selected) {
        return;
    }

    const component = componentsStore.getComponentById(selected.id);
    if (!component) {
        return;
    }

    const visibility = component.deviceVisibility;
    if (visibility && visibility[canvasStore.viewport] === false) {
        componentsStore.deselectComponent();
        return;
    }

    // Ждём рендера компонентов на новом viewport перед скроллом
    setTimeout(() => {
        scrollToComponentOnCanvas(selected.id);
    }, 350);
}

/**
 * Страхует откат transient drag-состояния: `dragend` приходит и после успешного
 * drop, и после отмены (Esc, уход за окно), даже если источник свои хендлеры не отработал.
 */
function handleDocumentDragEnd(): void {
    canvasStore.finishCanvasDrag();
}
// #endregion

// #region Lifecycle
/**
 * Инициализация канваса при монтировании компонента
 *
 * Последовательность:
 * 1. Ожидание готовности DOM (nextTick)
 * 2. Установка флага isMounted для активации динамических стилей
 * 3. Повторное ожидание для применения стилей
 * 4. Подписка на resize окна с debounce
 * 5. Расчет начального масштаба и центрирование
 * 6. Настройка ResizeObserver для отслеживания изменений размера контейнера
 * 7. Подписка на кастомные события layout-drop и slot-drop для drag-and-drop
 */
onMounted(async () => {
    // Синхронизация размеров холста с конфигом до расчёта scale/центрирования
    canvasStore.initCanvasSize();

    // Ожидание полной готовности DOM
    await nextTick();

    // Установка флага для включения динамических стилей
    isMounted.value = true;

    // Инициализация после применения стилей
    await nextTick();

    window.addEventListener('resize', debouncedResize);
    document.addEventListener('dragend', handleDocumentDragEnd);
    handleResize();
    updateContainerMetrics();
    scheduleCanvasCenter('auto');

    // Отслеживание изменений размера контейнера
    initMetricsObserver();

    // Подписка на события drag-and-drop для layout компонентов
    if (canvasRef.value) {
        canvasRef.value.addEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.addEventListener('slot-drop', handleSlotDrop as EventListener);
    }
});

/**
 * Очистка ресурсов при размонтировании компонента
 * (ResizeObserver и rAF центрирования чистят свои composables).
 */
onBeforeUnmount(() => {
    window.removeEventListener('resize', debouncedResize);
    document.removeEventListener('dragend', handleDocumentDragEnd);
    canvasStore.finishCanvasDrag();
    if (canvasRef.value) {
        canvasRef.value.removeEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.removeEventListener('slot-drop', handleSlotDrop as EventListener);
    }
});
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderCanvas">
        <!-- Canvas Area -->
        <div
            ref="canvasContainer"
            :class="[
                $style.canvasArea,
                { [$style.canvasAreaPanning]: isPanning },
                'bricks-scrollbox',
            ]"
            :style="canvasContainerStyle"
            @pointerdown="handleCanvasAreaPointerDown"
        >
            <!-- Figma Mode: три viewport-а рядом -->
            <div
                v-if="canvasStore.isFigmaMode"
                :class="$style.figmaOuter"
                :style="isMounted ? { minWidth: figmaWrapperMinWidth } : undefined"
            >
                <div
                    :class="$style.figmaWrapper"
                    :style="figmaWrapperStyle"
                    data-canvas-zoom-target="true"
                >
                    <BuilderCanvasViewport viewport="mobile" />
                    <BuilderCanvasViewport viewport="tablet" />
                    <BuilderCanvasViewport viewport="desktop" />
                </div>
            </div>

            <!-- Normal Mode: один канвас -->
            <div
                v-else
                ref="canvasWrapperRef"
                :class="$style.canvasWrapper"
                :style="isMounted ? canvasWrapperStyle : undefined"
            >
                <div
                    ref="canvasRef"
                    :class="[$style.canvas, 'bricks-canvas']"
                    :style="canvasStyle"
                    :data-bricks-viewport="canvasStore.viewport"
                    data-canvas-area="true"
                    data-canvas-zoom-target="true"
                    @drop="handleCanvasDrop"
                    @dragover="handleCanvasDragOver"
                    @click="handleCanvasClick"
                >
                    <!-- Screen content -->
                    <div :class="$style.screenContent">
                        <!-- Container (from default.scss) -->
                        <div
                            ref="containerRef"
                            :style="{
                                minHeight: convertPxToRem(canvasStore.height),
                                position: 'relative',
                            }"
                            data-root-drop-zone="true"
                            @dragenter="handleRootDragEnter"
                            @dragover="handleRootDragOver"
                            @dragleave="handleRootDragLeave"
                        >
                            <!-- Components (only root-level, children will be rendered inside layouts).
                                 Плейсхолдер вставки идёт тем же потоком; TransitionGroup сглаживает сдвиг соседей -->
                            <TransitionGroup name="bricks-canvas-flow">
                                <template v-for="entry in rootFlowEntries" :key="entry.key">
                                    <BuilderCanvasDropPlaceholder
                                        v-if="entry.kind === 'placeholder'"
                                        :contained="isRootPlaceholderContained"
                                    />

                                    <BuilderCanvasItem v-else :component="entry.component" />
                                </template>
                            </TransitionGroup>
                        </div>
                    </div>

                    <BuilderCanvasEmptyState
                        v-if="componentsStore.sortedComponents.length === 0 && !isCanvasDragActive"
                    />
                </div>
            </div>
        </div>

        <!-- Bottom floating bar: viewport + zoom + undo/redo + grid -->
        <BuilderCanvasBottomBar
            :scale="canvasStore.scale"
            :viewport="canvasStore.viewport"
            :sidebar-offset="leftSidebarOffset"
            :right-sidebar-offset="rightSidebarOffset"
            :is-figma-mode="canvasStore.isFigmaMode"
            @zoom-in="zoomInAtCenter"
            @zoom-out="zoomOutAtCenter"
            @zoom-reset="resetZoom"
            @update:viewport="canvasStore.setViewport"
            @toggle-figma-mode="canvasStore.toggleFigmaMode"
        />

        <!-- Inline Editing Overlay -->
        <BuilderCanvasInlineEditingOverlay />
    </div>
</template>

<style module lang="scss">
.TheBuilderCanvas {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
    flex-direction: column;
}

.canvasArea {
    position: relative;
    overflow: auto;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    flex: 1;
}

.canvasAreaPanning {
    cursor: grabbing;
}

.canvasWrapper {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: max-content;
    margin: 0 auto;
    padding: 6rem 0;
}

// Layout-обёртка Figma Mode: несёт min-width по визуальной ширине,
// transform живёт на .figmaWrapper внутри (иначе масштаб применился бы дважды)
.figmaOuter {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: max-content;
    margin: 2rem auto 0;
}

.figmaWrapper {
    display: flex;
    align-items: flex-start;
    width: max-content;
    padding: 10rem 0;
    transform-origin: top center;
}

.canvas {
    position: relative;
    overflow: visible;
    margin-top: 2rem;
    border-radius: var(--bricks-border-radius-xs);
    background-color: var(--bricks-base-0);
    transform-origin: top center;
    transition: transform 250ms ease;
    box-shadow: var(--bricks-shadow-md);
    container-type: inline-size;
    container-name: bricks;
}

.screenContent {
    position: relative;
    width: 100%;
}
</style>
