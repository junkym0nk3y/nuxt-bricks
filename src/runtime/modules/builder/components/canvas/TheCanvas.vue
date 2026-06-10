<script setup lang="ts">
// #region Imports
// Types
import type { IDragComposableCanvas } from './types';

// Vue
import { ref, computed, inject, provide, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';

// VueUse
import { useDebounceFn } from '@vueuse/core';

// Pinia
import { useLandingComponentsStore } from '../../stores/components';
import { useLandingCanvasStore } from '../../stores/canvas';
import { useLandingSidebarStore } from '../../stores/sidebar';
import { usePublishStore } from '../../stores/publish';

// Composables
import { useLandingCanvas } from '../../composables/useLandingCanvas';
import { useLandingConfig } from '../../../common/composables/useLandingConfig';
import { useLandingCanvasDrops } from '../../composables/useLandingCanvasDrops';
import { useLandingCanvasPan } from '../../composables/useLandingCanvasPan';

// Utils
import { convertPxToRem } from '../../../common/utils/main';
import { scrollToComponentOnCanvas } from '../../utils/scrollToComponent';

// Components
import BricksCanvasItem from './BricksCanvasItem.vue';
import CanvasToolbar from './CanvasToolbar.vue';
import CanvasEmptyState from './CanvasEmptyState.vue';
import CanvasViewport from './CanvasViewport.vue';
import CanvasInlineEditingOverlay from './CanvasInlineEditingOverlay.vue';
// #endregion

// #region Data
const componentsStore = useLandingComponentsStore();
const canvasStore = useLandingCanvasStore();
const sidebarStore = useLandingSidebarStore();
const publishStore = usePublishStore();
const config = useLandingConfig();
const {
    canvasContainer,
    canvasTransform,
    figmaBaseTransform,
    canvasContainerStyle,
    figmaGap,
    getRemCompensation,
    handleResize,
} = useLandingCanvas();

const dragComposable = inject<IDragComposableCanvas | undefined>('dragComposable');

provide(
    'showGrid',
    computed(() => canvasStore.showGrid)
);

/** Rem-компенсация для per-viewport scaling в Figma Mode */
provide('getRemCompensation', getRemCompensation);

const canvasRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const canvasWrapperRef = ref<HTMLElement | null>(null);
const isMounted = ref(false);

const {
    rootDropIndicatorVisible,
    rootDropIndicatorStyle,
    rootDropIndicatorRef,
    handleRootDragEnter,
    handleRootDragOver,
    handleRootDragLeave,
    handleCanvasDrop,
    handleCanvasDragOver,
    handleLayoutDrop,
    handleSlotDrop,
} = useLandingCanvasDrops({
    dragComposable,
    componentsStore,
    canvasRef,
    containerRef,
});

const { isPanning, handleCanvasAreaPointerDown } = useLandingCanvasPan(canvasContainer);

let containerResizeObserver: ResizeObserver | null = null;
let centerAnimationFrame: number | null = null;
let pendingCenterBehavior: ScrollBehavior = 'auto';
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
        backgroundColor: publishStore.currentFormState.backgroundColor || 'var(--land-base-0)',
        fontFamily: config.defaultFont,
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

/**
 * Стили для обёртки Figma Mode — базовый scale без rem-компенсации.
 * Per-viewport компенсация применяется внутри каждого CanvasViewport.
 */
const figmaWrapperStyle = computed<Record<string, string>>(() => {
    if (!isMounted.value) {
        return {};
    }

    return {
        transform: figmaBaseTransform.value,
        gap: figmaGap,
    };
});
// #endregion

// #region Methods
/**
 * Центрирует канвас по горизонтали относительно доступной ширины.
 *
 * @param options - Настройки прокрутки контейнера.
 */
function centerCanvasHorizontally(options: { behavior?: ScrollBehavior } = {}): void {
    if (typeof window === 'undefined') {
        return;
    }

    const container = canvasContainer.value;

    if (!container) {
        return;
    }

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const behavior = options.behavior ?? 'auto';

    if (maxScrollLeft <= 0) {
        container.scrollLeft = 0;
        return;
    }

    const targetLeft = maxScrollLeft / 2;

    if (behavior === 'smooth' && typeof container.scrollTo === 'function') {
        container.scrollTo({
            left: targetLeft,
            behavior,
        });
        return;
    }

    container.scrollLeft = targetLeft;
}

/**
 * Планирует центрирование канваса в ближайшем кадре анимации.
 *
 * @param behavior - Поведение прокрутки (`auto` или `smooth`).
 */
function scheduleCanvasCenter(behavior: ScrollBehavior = 'auto'): void {
    if (behavior === 'smooth') {
        pendingCenterBehavior = 'smooth';
    } else if (pendingCenterBehavior !== 'smooth') {
        pendingCenterBehavior = behavior;
    }

    if (centerAnimationFrame !== null) {
        cancelAnimationFrame(centerAnimationFrame);
    }

    centerAnimationFrame = requestAnimationFrame(() => {
        centerAnimationFrame = null;
        centerCanvasHorizontally({ behavior: pendingCenterBehavior });
        pendingCenterBehavior = 'auto';
    });
}

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
 * Capture-фаза: сбрасывает интерактивный предпросмотр при клике вне компонента.
 * Capture срабатывает ДО stopPropagation в дочерних элементах,
 * поэтому работает даже когда интерактивный компонент перехватывает события.
 */
function handleInteractivePreviewOutsideClick(event: PointerEvent): void {
    const previewId = componentsStore.interactivePreviewId;
    if (!previewId) {
        return;
    }

    const target = event.target as HTMLElement;

    // Клик внутри самого интерактивного компонента — не сбрасываем
    if (target.closest(`[data-component-id="${previewId}"]`)) {
        return;
    }

    // Клик по тулбару (телепортирован в body) — не сбрасываем
    if (target.closest('[data-canvas-toolbar]')) {
        return;
    }

    componentsStore.interactivePreviewId = null;
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
// #endregion

// #region Lifecycle
/**
 * Пересчитывает высоту канваса при изменении состава компонентов.
 *
 * Два источника покрывают все кейсы:
 * - `components` (ссылка) — ловит полную замену массива (loadSchema, undo/redo)
 * - `components.length` — ловит мутации (push в addComponent, splice в moveComponentToRoot)
 *
 * ResizeObserver не срабатывает при уменьшении контента (minHeight не даёт контейнеру сжаться),
 * поэтому нужен явный пересчёт при add/remove/import.
 */
watch([() => componentsStore.components, () => componentsStore.components.length], () => {
    nextTick(() => {
        updateContainerMetrics();
    });
});

/**
 * Отслеживает появление canvasContainer и центрирует канвас
 * При монтировании контейнера автоматически центрирует его по горизонтали
 */
watch(
    () => canvasContainer.value,
    (container) => {
        if (container) {
            scheduleCanvasCenter('auto');
        }
    }
);

/**
 * Отслеживает изменения масштаба и ширины канваса.
 * При изменении этих параметров пересчитывает центрирование.
 */
watch(
    () => [canvasStore.scale, canvasStore.width],
    () => {
        scheduleCanvasCenter('auto');
    }
);

/**
 * Пересчитывает высоту канваса после смены viewport.
 *
 * При смене адаптива (mobile → tablet → desktop) контент перестраивается:
 * компоненты меняют высоту из-за другой ширины, grid-колонки перестраиваются,
 * container queries переключаются. Высота сбрасывается до базовой в setViewport,
 * здесь подбираем правильную после рендера.
 */
watch(
    () => canvasStore.viewport,
    () => {
        nextTick(() => {
            updateContainerMetrics();
            scrollToSelectedAfterViewportSwitch();
        });
    }
);

/**
 * Отслеживает видимость и ширину левого сайдбара
 * При открытии/закрытии сайдбара плавно центрирует канвас (с анимацией)
 */
watch(
    () => [sidebarStore.left.visible, sidebarStore.left.width],
    () => {
        scheduleCanvasCenter('smooth');
    }
);

/**
 * Переподключает ResizeObserver при смене containerRef.
 *
 * При переключении Figma ↔ Normal режимов v-if уничтожает старый DOM-элемент
 * и создаёт новый. ResizeObserver остаётся на старом (уничтоженном) элементе,
 * поэтому updateContainerMetrics() перестаёт вызываться автоматически.
 */
watch(containerRef, (newContainer, oldContainer) => {
    if (containerResizeObserver) {
        if (oldContainer) {
            containerResizeObserver.unobserve(oldContainer);
        }
        if (newContainer) {
            containerResizeObserver.observe(newContainer);
        }
    }
});

/**
 * Отслеживает переключение Figma Mode.
 * Ждёт обновления DOM (v-if рендерит/убирает figmaWrapper),
 * затем пересчитывает высоту канваса и центрирует его.
 */
watch(
    () => canvasStore.isFigmaMode,
    (isFigma) => {
        nextTick(() => {
            updateContainerMetrics();
            scheduleCanvasCenter('auto');

            // При выходе из Figma mode — скроллим до выбранного компонента
            if (!isFigma) {
                scrollToSelectedAfterViewportSwitch();
            }
        });
    }
);

/**
 * Обновляет высоту канваса исходя из содержимого корневого контейнера.
 */
function updateContainerMetrics(): void {
    const container = containerRef.value;
    if (!container) {
        return;
    }

    const previousMinHeight = container.style.minHeight;
    container.style.minHeight = '';
    const contentHeight = container.scrollHeight;
    container.style.minHeight = previousMinHeight;
    canvasStore.syncCanvasHeightWithContent(contentHeight, componentsStore.hasComponents);
}

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
    // Ожидание полной готовности DOM
    await nextTick();

    // Установка флага для включения динамических стилей
    isMounted.value = true;

    // Инициализация после применения стилей
    await nextTick();

    window.addEventListener('resize', debouncedResize);
    document.addEventListener('pointerdown', handleInteractivePreviewOutsideClick, true);
    handleResize();
    updateContainerMetrics();
    scheduleCanvasCenter('auto');

    // Отслеживание изменений размера контейнера
    containerResizeObserver = new ResizeObserver(() => {
        updateContainerMetrics();
        scheduleCanvasCenter('auto');
    });
    if (containerRef.value) {
        containerResizeObserver.observe(containerRef.value);
    }

    // Подписка на события drag-and-drop для layout компонентов
    if (canvasRef.value) {
        canvasRef.value.addEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.addEventListener('slot-drop', handleSlotDrop as EventListener);
    }
});

/**
 * Очистка ресурсов при размонтировании компонента
 *
 * Удаляет:
 * - Слушатель события resize окна
 * - Слушатели кастомных событий drag-and-drop
 * - ResizeObserver для контейнера
 * - Запланированный кадр анимации центрирования
 */
onBeforeUnmount(() => {
    window.removeEventListener('resize', debouncedResize);
    document.removeEventListener('pointerdown', handleInteractivePreviewOutsideClick, true);
    if (canvasRef.value) {
        canvasRef.value.removeEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.removeEventListener('slot-drop', handleSlotDrop as EventListener);
    }
    if (containerResizeObserver && containerRef.value) {
        containerResizeObserver.unobserve(containerRef.value);
    }
    containerResizeObserver?.disconnect();
    containerResizeObserver = null;
    if (centerAnimationFrame !== null) {
        cancelAnimationFrame(centerAnimationFrame);
        centerAnimationFrame = null;
    }
});
// #endregion
</script>

<template>
    <div :class="$style.TheCanvas">
        <!-- Canvas Toolbar -->
        <CanvasToolbar
            :scale="canvasStore.scale"
            :viewport="canvasStore.viewport"
            :sidebar-offset="leftSidebarOffset"
            :is-figma-mode="canvasStore.isFigmaMode"
            @zoom-in="canvasStore.zoomIn"
            @zoom-out="canvasStore.zoomOut"
            @zoom-reset="canvasStore.zoomReset"
            @update:viewport="canvasStore.setViewport"
            @toggle-figma-mode="canvasStore.toggleFigmaMode"
        />

        <!-- Canvas Area -->
        <div
            ref="canvasContainer"
            :class="[$style.canvasArea, { [$style.canvasAreaPanning]: isPanning }, 'scrollbox']"
            :style="canvasContainerStyle"
            @pointerdown="handleCanvasAreaPointerDown"
        >
            <!-- Figma Mode: три viewport-а рядом -->
            <div
                v-if="canvasStore.isFigmaMode"
                :class="$style.figmaWrapper"
                :style="figmaWrapperStyle"
            >
                <CanvasViewport viewport="mobile" />
                <CanvasViewport viewport="tablet" />
                <CanvasViewport viewport="desktop" />
            </div>

            <!-- Normal Mode: один канвас -->
            <div v-else ref="canvasWrapperRef" :class="$style.canvasWrapper">
                <div
                    ref="canvasRef"
                    :class="[$style.canvas, 'landing-canvas']"
                    :style="canvasStyle"
                    :data-landing-viewport="canvasStore.viewport"
                    data-canvas-area="true"
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
                            <!-- Components (only root-level, children will be rendered inside layouts) -->
                            <BricksCanvasItem
                                v-for="component in componentsStore.getRootComponents()"
                                :key="component.id"
                                :component="component"
                            />

                            <!-- Root drop indicator -->
                            <div
                                v-if="rootDropIndicatorVisible"
                                ref="rootDropIndicatorRef"
                                :class="$style.rootDropIndicator"
                                :style="rootDropIndicatorStyle"
                                data-root-drop-indicator="true"
                            />
                        </div>
                    </div>

                    <CanvasEmptyState v-if="componentsStore.sortedComponents.length === 0" />
                </div>
            </div>
        </div>

        <!-- Inline Editing Overlay -->
        <CanvasInlineEditingOverlay />
    </div>
</template>

<style module lang="scss">
.TheCanvas {
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
    width: max-content;
    margin: 0 auto;
    padding: 6rem 0;
}

.figmaWrapper {
    display: flex;
    align-items: flex-start;
    width: max-content;
    margin: 2rem auto 0;
    padding: 10rem 0;
    transform-origin: top center;
}

.canvas {
    position: relative;
    overflow: visible;
    margin-top: 2rem;
    border-radius: var(--border-radius-xs);
    background-color: var(--land-base-0);
    transform-origin: top center;
    transition: transform 250ms ease;
    box-shadow: var(--shadow-md);
    container-type: inline-size;
    container-name: landing;
}

.screenContent {
    position: relative;
    width: 100%;
}

.rootDropIndicator {
    position: absolute;
    left: 0;
    z-index: 5;
    width: 100%;
    height: 0.4rem;
    border-radius: 50%;
    background: rgb(var(--rgb-indigo) / 70%);
    pointer-events: none;
}
</style>
