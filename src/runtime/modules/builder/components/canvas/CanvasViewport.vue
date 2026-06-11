<script setup lang="ts">
// #region Imports
// Types
import type { TViewportType, IDragComposableCanvas } from './types';
import type { IDeviceVisibilityConfig } from '../../../common/types/landing';

// Vue
import { computed, ref, inject, provide, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../stores/components';
import { useCanvasStore } from '../../stores/canvas';
import { usePublishStore } from '../../stores/publish';

// Composables
import { useLandingConfig } from '../../../common/composables/useLandingConfig';
import { useCanvasDrops } from '../../composables/useCanvasDrops';

// Utils
import { convertPxToRem } from '../../../common/utils/main';

// Components
import CanvasItem from './CanvasItem.vue';
// #endregion

// #region Interfaces
interface ICanvasViewportProps {
    viewport: TViewportType;
}
// #endregion

// #region Props
const props = defineProps<ICanvasViewportProps>();
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const publishStore = usePublishStore();
const config = useLandingConfig();

const dragComposable = inject<IDragComposableCanvas | undefined>('dragComposable');
const getRemCompensation = inject<((viewport: TViewportType) => number) | undefined>(
    'getRemCompensation'
);

/** Провайдим viewport для дочерних CanvasItem (используется для Figma mode) */
provide('canvasViewport', props.viewport);

const canvasRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

const VIEWPORT_HEIGHTS: Record<TViewportType, number> = {
    mobile: 812,
    tablet: 1024,
    desktop: 1080,
};

const CANVAS_HEIGHT_BUFFER = 400;

const DEVICE_VISIBILITY_MAP: Record<TViewportType, IDeviceVisibilityConfig> = {
    mobile: { mobile: true, tablet: false, desktop: false },
    tablet: { mobile: false, tablet: true, desktop: false },
    desktop: { mobile: false, tablet: false, desktop: true },
};

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
} = useCanvasDrops({
    dragComposable,
    componentsStore,
    canvasRef,
    containerRef,
});

let containerResizeObserver: ResizeObserver | null = null;
// #endregion

// #region Computed
const viewportWidth = computed<number>(() => {
    const breakpoints = config.canvasBreakpoints;
    const widths: Record<TViewportType, number> = {
        mobile: breakpoints.mobile.width,
        tablet: breakpoints.tablet.width,
        desktop: breakpoints.desktop.width,
    };
    return widths[props.viewport];
});

const viewportHeight = ref<number>(VIEWPORT_HEIGHTS.desktop);

const canvasStyle = computed<Record<string, string>>(() => {
    const compensation = getRemCompensation?.(props.viewport) ?? 1;
    const style: Record<string, string> = {
        width: convertPxToRem(viewportWidth.value),
        height: convertPxToRem(viewportHeight.value),
        backgroundColor: publishStore.currentFormState.backgroundColor || 'var(--land-base-0)',
        fontFamily: config.defaultFont,
    };

    if (compensation !== 1) {
        style.transform = `scale(${compensation})`;
        style.transformOrigin = 'top center';
    }

    return style;
});

const viewportLabel = computed<string>(() => {
    const labels: Record<TViewportType, string> = {
        mobile: 'Mobile',
        tablet: 'Tablet',
        desktop: 'Desktop',
    };
    return `${labels[props.viewport]} — ${viewportWidth.value}px`;
});
// #endregion

// #region Methods
/**
 * Синхронизирует высоту viewport-а с фактическим контентом.
 */
function updateViewportHeight(): void {
    const container = containerRef.value;
    if (!container) {
        return;
    }

    const baseHeight = VIEWPORT_HEIGHTS[props.viewport];

    if (!componentsStore.hasComponents) {
        viewportHeight.value = baseHeight;
        return;
    }

    const previousMinHeight = container.style.minHeight;
    container.style.minHeight = '';
    const contentHeight = container.scrollHeight;
    container.style.minHeight = previousMinHeight;

    const baselineWithBuffer = baseHeight + CANVAS_HEIGHT_BUFFER;
    viewportHeight.value = Math.max(
        baselineWithBuffer,
        Math.ceil(contentHeight + CANVAS_HEIGHT_BUFFER)
    );
}

/**
 * Обрабатывает клик по канвасу — сбрасывает выбор.
 *
 * @param event - Событие клика.
 */
function handleCanvasClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
        componentsStore.deselectComponent();
    }
}

/**
 * Обрабатывает drop на канвас viewport-а.
 * Делегирует позиционирование в handleCanvasDrop.
 * Если figmaDropPerViewport включён — ограничивает видимость только текущим viewport.
 *
 * @param event - Нативное drop-событие.
 */
function handleViewportDrop(event: DragEvent): void {
    const idsBefore = new Set(componentsStore.components.map((c) => c.id));

    handleCanvasDrop(event);

    if (!canvasStore.figmaDropPerViewport) {
        return;
    }

    const newComponent = componentsStore.components.find((c) => !idsBefore.has(c.id));
    if (newComponent) {
        componentsStore.setComponentDeviceVisibility(
            newComponent.id,
            DEVICE_VISIBILITY_MAP[props.viewport]
        );
    }
}
// #endregion

// #region Lifecycle
/**
 * Пересчитывает высоту viewport-а при изменении состава компонентов.
 *
 * Два источника покрывают все кейсы:
 * - `components` (ссылка) — ловит полную замену массива (loadSchema, undo/redo)
 * - `components.length` — ловит мутации (push, splice)
 *
 * ResizeObserver не срабатывает при уменьшении контента (minHeight блокирует сжатие контейнера).
 */
watch([() => componentsStore.components, () => componentsStore.components.length], () => {
    nextTick(() => {
        updateViewportHeight();
    });
});

onMounted(async () => {
    await nextTick();

    updateViewportHeight();

    containerResizeObserver = new ResizeObserver(() => {
        updateViewportHeight();
    });

    if (containerRef.value) {
        containerResizeObserver.observe(containerRef.value);
    }

    if (canvasRef.value) {
        canvasRef.value.addEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.addEventListener('slot-drop', handleSlotDrop as EventListener);
    }
});

onBeforeUnmount(() => {
    if (canvasRef.value) {
        canvasRef.value.removeEventListener('layout-drop', handleLayoutDrop as EventListener);
        canvasRef.value.removeEventListener('slot-drop', handleSlotDrop as EventListener);
    }
    if (containerResizeObserver && containerRef.value) {
        containerResizeObserver.unobserve(containerRef.value);
    }
    containerResizeObserver?.disconnect();
    containerResizeObserver = null;
});
// #endregion
</script>

<template>
    <div :class="$style.CanvasViewport">
        <div :class="$style.label">{{ viewportLabel }}</div>

        <div
            ref="canvasRef"
            :class="[$style.canvas, 'landing-canvas']"
            :style="canvasStyle"
            :data-landing-viewport="props.viewport"
            @drop="handleViewportDrop"
            @dragover="handleCanvasDragOver"
            @click="handleCanvasClick"
        >
            <div :class="$style.screenContent">
                <div
                    ref="containerRef"
                    :style="{
                        minHeight: convertPxToRem(viewportHeight),
                        position: 'relative',
                    }"
                    data-root-drop-zone="true"
                    @dragenter="handleRootDragEnter"
                    @dragover="handleRootDragOver"
                    @dragleave="handleRootDragLeave"
                >
                    <CanvasItem
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
        </div>
    </div>
</template>

<style module lang="scss">
.CanvasViewport {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
}

.label {
    margin-bottom: 0.8rem;
    text-transform: uppercase;
    font-size: 2.4rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--land-base-500);
}

.canvas {
    position: relative;
    overflow: visible;
    border-radius: var(--border-radius-xs);
    background-color: var(--land-base-0);
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
