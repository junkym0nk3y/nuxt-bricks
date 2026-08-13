<script setup lang="ts">
// #region Imports
// Types
import type { ICanvasViewportProps, IDragComposableCanvas } from '../../types/components';
import type { TBricksDeviceKey } from '../../../../common/types/brick';
import type { TDropFlowEntry } from '../../../core/types/drag';

// Vue
import { computed, ref, inject, provide, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';
import { usePublishStore } from '../../../publish/stores/publish';

// Composables
import { useBricksConfig } from '../../../../common/composables/useBricksConfig';
import { useCanvasDrops } from '../composables/useCanvasDrops';
import { useCanvasFlowGuard } from '../composables/useCanvasFlowGuard';

// Constants
import { DEFAULT_CANVAS_HEIGHT } from '../../../../common/constants/devices';
import { CANVAS_VIEWPORT_KEY } from '../../../../common/constants/injectionKeys';

// Utils
import { convertPxToRem } from '../../../../common/utils/main';
import { buildDropFlowEntries, getDragPlaceholderVars } from '../../../core/utils/dragVisuals';

// Components
import BuilderCanvasItem from '../../item/components/BuilderCanvasItem.vue';
import BuilderCanvasDropPlaceholder from './BuilderCanvasDropPlaceholder.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ICanvasViewportProps>(), {});
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const publishStore = usePublishStore();
const config = useBricksConfig();

const dragComposable = inject<IDragComposableCanvas | undefined>('dragComposable');
const getRemCompensation = inject<((viewport: TBricksDeviceKey) => number) | undefined>(
    'getRemCompensation'
);

/** Провайдим viewport для дочерних BuilderCanvasItem (Figma mode, ближайший провайдер выигрывает) */
provide(
    CANVAS_VIEWPORT_KEY,
    computed(() => props.viewport)
);

const canvasRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

const CANVAS_HEIGHT_BUFFER = 400;

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

let containerResizeObserver: ResizeObserver | null = null;

// Figma mode: масштаб общий для всех viewport-ов — глушим переходы потока так же,
// как в обычном канвасе.
useCanvasFlowGuard(canvasRef);
// #endregion

// #region Computed
/** Устройство набора, которому принадлежит этот лист. */
const device = computed(() => canvasStore.devices.find((item) => item.key === props.viewport));

const viewportWidth = computed<number>(() => canvasStore.getViewportWidth(props.viewport));

const viewportHeight = ref<number>(DEFAULT_CANVAS_HEIGHT);

const canvasStyle = computed<Record<string, string>>(() => {
    const compensation = getRemCompensation?.(props.viewport) ?? 1;
    const style: Record<string, string> = {
        width: convertPxToRem(viewportWidth.value),
        height: convertPxToRem(viewportHeight.value),
        backgroundColor: publishStore.currentFormState.backgroundColor || 'var(--bricks-base-0)',
        fontFamily: config.defaultFont,
        ...getDragPlaceholderVars(canvasStore.dragState),
    };

    if (compensation !== 1) {
        style.transform = `scale(${compensation})`;
        style.transformOrigin = 'top center';
    }

    return style;
});

/** Root-поток: блоки страницы и место вставки одним keyed-списком для TransitionGroup. */
const rootFlowEntries = computed<TDropFlowEntry[]>(() =>
    buildDropFlowEntries(componentsStore.getRootComponents(), rootDropIndex.value, 'root-drop')
);

// Подпись берётся из набора: имён Mobile/Tablet/Desktop в коде больше нет —
// устройство может называться как угодно и быть четвёртым
const viewportLabel = computed<string>(
    () => `${device.value?.label ?? props.viewport} — ${viewportWidth.value}px`
);
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

    const baseHeight = canvasStore.getViewportHeight(props.viewport);

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
        // One-hot по набору, а не по трём зашитым ключам: блок, брошенный на
        // лист ноутбука, обязан скрыться и на всех остальных устройствах набора
        componentsStore.setComponentDeviceVisibility(
            newComponent.id,
            Object.fromEntries(
                canvasStore.devices.map((item) => [item.key, item.key === props.viewport])
            )
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
    <div :class="$style.BuilderCanvasViewport">
        <div :class="$style.label">{{ viewportLabel }}</div>

        <div
            ref="canvasRef"
            :class="[$style.canvas, 'bricks-canvas']"
            :style="canvasStyle"
            :data-bricks-viewport="props.viewport"
            data-canvas-area="true"
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
                    <!-- Плейсхолдер раздвигает соседей в потоке; TransitionGroup сглаживает сдвиг -->
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
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderCanvasViewport {
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

    // Подпись лежит на фоне рабочей области, а он один в обеих темах: с
    // темозависимым base-500 в тёмной теме получался светлый текст на светлом
    color: var(--bricks-workspace-fg);
}

.canvas {
    position: relative;
    overflow: visible;
    border-radius: var(--bricks-border-radius-xs);
    background-color: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-md);
    container-type: inline-size;
    container-name: bricks;
}

.screenContent {
    position: relative;
    width: 100%;
}
</style>
