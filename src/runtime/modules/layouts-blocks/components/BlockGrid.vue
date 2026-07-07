<script setup lang="ts">
// #region Imports
// Types
import type { IGridLayoutProps, TGridLayoutVariant, TGridRowHeight } from '../types/blockProps';

// Vue
import { computed, ref, inject, onMounted, onBeforeUnmount, type Ref, type Slot } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { calculateGridDropTargetIndex } from '../utils/gridDropPlacement';

// Composables
import { useLayoutDropZone } from '../composables/useLayoutDropZone';

// Components
import BlockGridOverlay from './BlockGridOverlay.vue';
// #endregion

// #region Props
const props = defineProps<{
    layoutProps: IGridLayoutProps;
    layoutId?: string;
}>();

const slots = defineSlots<{
    default?: Slot;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
const gridRef = ref<HTMLElement | null>(null);
const containerSize = ref({ width: 0, height: 0 });

/** Грид заполнен и drop невозможен (визуальная обратная связь) */
const isGridFull = ref(false);

/** Реальные размеры строк грида из DOM */
const actualRowSizes = ref<number[]>([]);
// #endregion

// #region Computed

const isEmpty = computed(() => {
    return !slots.default?.();
});

const normalizedColumns = computed<number>(() => {
    if (!props.layoutProps.columns || props.layoutProps.columns < 1) {
        return 1;
    }
    return Math.floor(props.layoutProps.columns);
});

const normalizedRows = computed<number>(() => {
    if (!props.layoutProps.rows || props.layoutProps.rows < 1) {
        return 1;
    }
    return Math.floor(props.layoutProps.rows);
});

const accentSpan = computed<number>(() => Math.max(1, Math.round(normalizedColumns.value / 2)));

const gridVariant = computed<TGridLayoutVariant>(() => props.layoutProps.variant ?? 'default');

const gridAutoFlow = computed<string>(() =>
    gridVariant.value === 'default' ? 'row' : 'row dense'
);

const normalizedGap = computed<number>(() => Math.max(0, Number(props.layoutProps.gap) || 0));

const rowHeight = computed<TGridRowHeight>(() => props.layoutProps.rowHeight ?? 'auto');

const minRowHeight = computed<number>(() =>
    Math.max(0, Number(props.layoutProps.minRowHeight) || 0)
);

const DEFAULT_GRID_MIN_HEIGHT = '10rem';

/**
 * Строит значение для gridTemplateRows на основе настроек.
 */
function buildGridTemplateRows(): string {
    const rows = normalizedRows.value;
    const height = rowHeight.value;
    const minHeight = minRowHeight.value;

    if (minHeight > 0) {
        const minValue = `${minHeight}rem`;
        const maxValue = height === '1fr' ? '1fr' : 'auto';
        return `repeat(${rows}, minmax(${minValue}, ${maxValue}))`;
    }

    return `repeat(${rows}, ${height})`;
}

const normalizedPaddingX = computed<number>(
    () => Math.round(Math.max(0, Number(props.layoutProps.paddingX) || 0) * 10) / 10
);
const normalizedPaddingY = computed<number>(
    () => Math.round(Math.max(0, Number(props.layoutProps.paddingY) || 0) * 10) / 10
);

const gridStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {
        display: 'grid',
        gridTemplateColumns: `repeat(${normalizedColumns.value}, 1fr)`,
        gridTemplateRows: buildGridTemplateRows(),
        gridAutoRows: minRowHeight.value > 0 ? `minmax(${minRowHeight.value}rem, auto)` : 'auto',
        gap: convertPxToRem(normalizedGap.value),
        width: '100%',
        position: 'relative',
        pointerEvents: 'auto',
        gridAutoFlow: gridAutoFlow.value,
        alignItems: 'stretch',
        minHeight: DEFAULT_GRID_MIN_HEIGHT,
        '--bricks-grid-accent-span': String(accentSpan.value),
    };

    const px = normalizedPaddingX.value;
    const py = normalizedPaddingY.value;

    if (px > 0 || py > 0) {
        style.padding = `${py}rem ${px}rem`;
    }

    return style;
});

const overlayStyle = computed<Record<string, string>>((): Record<string, string> => {
    const px = normalizedPaddingX.value;
    const py = normalizedPaddingY.value;

    if (px > 0 || py > 0) {
        return {
            top: `${py}rem`,
            left: `${px}rem`,
        };
    }

    return {};
});
// #endregion

// #region Methods
/**
 * Synchronizes internal container size with DOM measurements.
 * Вычисляет content area (без padding) для корректного overlay.
 * Also extracts actual row sizes from computed grid style.
 */
function updateSize(): void {
    if (gridRef.value) {
        const computedStyle = window.getComputedStyle(gridRef.value);
        const padLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const padRight = parseFloat(computedStyle.paddingRight) || 0;
        const padTop = parseFloat(computedStyle.paddingTop) || 0;
        const padBottom = parseFloat(computedStyle.paddingBottom) || 0;

        containerSize.value = {
            width: gridRef.value.offsetWidth - padLeft - padRight,
            height: gridRef.value.offsetHeight - padTop - padBottom,
        };

        // Получаем реальные размеры строк из CSS Grid
        const gridRowSizes = computedStyle.gridTemplateRows;

        if (gridRowSizes && gridRowSizes !== 'none') {
            // Парсим значения вида "100px 200px 150px" в массив чисел
            const sizes = gridRowSizes
                .split(/\s+/)
                .map((size) => parseFloat(size))
                .filter((size) => !Number.isNaN(size) && size > 0);

            actualRowSizes.value = sizes;
        } else {
            actualRowSizes.value = [];
        }
    }
}

/**
 * Возвращает количество дочерних элементов в гриде.
 */
function getCurrentChildCount(): number {
    if (!gridRef.value) {
        return 0;
    }
    return gridRef.value.querySelectorAll(':scope > [data-layout-drop-item]').length;
}

/**
 * Проверяет, заполнен ли грид до максимальной ёмкости (rows × columns).
 */
function checkGridAtCapacity(): boolean {
    const maxItems = normalizedRows.value * normalizedColumns.value;
    return getCurrentChildCount() >= maxItems;
}

/**
 * Проверяет, является ли перетаскиваемый компонент дочерним элементом этого грида.
 */
function isChildOfThisGrid(componentId: string): boolean {
    if (!gridRef.value) {
        return false;
    }

    return (
        gridRef.value.querySelector(
            `:scope > [data-layout-drop-item][data-component-id="${CSS.escape(componentId)}"]`
        ) !== null
    );
}

/**
 * Dragover-проверка ёмкости. Во время dragover нельзя прочитать данные из
 * dataTransfer (security), но можно проверить types. Если есть component-id —
 * это перемещение существующего компонента (возможно внутри этого же грида →
 * swap). Блокируем только добавление новых из библиотеки при полном гриде.
 *
 * @param event - Dragover-событие браузера.
 */
function canAcceptGridDragOver(event: DragEvent): boolean {
    const types = Array.from(event.dataTransfer?.types || []);
    const isExistingComponent = types.includes('component-id');

    if (!isExistingComponent && checkGridAtCapacity()) {
        isGridFull.value = true;
        return false;
    }

    isGridFull.value = false;
    return true;
}

/**
 * Drop-проверка ёмкости: в заполненном гриде разрешены только перемещения
 * его собственных детей (внутренний swap ёмкость не меняет).
 *
 * @param _event - Drop-событие браузера (не используется).
 * @param movedComponentId - ID перемещаемого компонента или null для нового.
 */
function canAcceptGridDrop(_event: DragEvent, movedComponentId: string | null): boolean {
    if (!checkGridAtCapacity()) {
        return true;
    }

    if (movedComponentId && isChildOfThisGrid(movedComponentId)) {
        return true;
    }

    console.warn('[BlockGrid] Grid is at capacity, ignoring drop');
    return false;
}

/**
 * Сбрасывает флаг заполненности грида.
 */
function clearGridFull(): void {
    isGridFull.value = false;
}

/**
 * Вычисляет targetIndex (ячейку грида) по позиции курсора.
 */
function calculateDropTargetIndex(event: DragEvent): number | null {
    return calculateGridDropTargetIndex(
        event,
        gridRef.value,
        normalizedColumns.value,
        normalizedRows.value
    );
}
// #endregion

// #region Drop zone
const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useLayoutDropZone({
        containerRef: gridRef,
        layoutId: () => props.layoutId,
        canAcceptDragOver: canAcceptGridDragOver,
        canAcceptDrop: canAcceptGridDrop,
        resolveDropIndex: calculateDropTargetIndex,
        requireDropIndex: true,
        onReset: clearGridFull,
        extraDropDetail: { swap: true },
    });
// #endregion

// #region Lifecycle
onMounted(() => {
    updateSize();
    window.addEventListener('resize', updateSize);

    const resizeObserver = new ResizeObserver(updateSize);
    if (gridRef.value) {
        resizeObserver.observe(gridRef.value);
    }

    onBeforeUnmount(() => {
        window.removeEventListener('resize', updateSize);
        resizeObserver.disconnect();
    });
});
// #endregion
</script>

<template>
    <div
        ref="gridRef"
        :class="[
            $style.BlockGrid,
            {
                [$style.dragOver]: isDragOver,
                [$style.gridHidden]: !showGrid,
                [$style.gridFull]: isGridFull,
            },
        ]"
        :style="gridStyle"
        :data-grid-variant="gridVariant"
        data-layout-drop-zone="true"
        :data-layout-id="layoutId ?? null"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <!-- Grid visualization SVG overlay -->
        <BlockGridOverlay
            v-if="showGrid && containerSize.width > 0"
            :style="overlayStyle"
            :container-size="containerSize"
            :columns="normalizedColumns"
            :gap="normalizedGap"
            :row-sizes="actualRowSizes"
        />

        <!-- Content -->
        <slot />

        <!-- Drop placeholder when empty -->
        <div v-if="isEmpty" :class="$style.emptyPlaceholder">Drop components here</div>
    </div>
</template>

<style module lang="scss">
.BlockGrid {
    --bricks-grid-accent-span: 2;

    position: relative;
    min-width: 0;
    border: 1px dashed rgb(var(--rgb-layout-grid) / 30%);
    background: rgb(var(--rgb-layout-grid) / 5%);
    transition: all 200ms ease;

    > :global([data-layout-drop-item='true']) {
        overflow: hidden;
        min-width: 0;
        min-height: 0;
        grid-row: span 1; // Ограничиваем элемент одной строкой
    }

    &:hover {
        border-color: rgb(var(--rgb-layout-grid) / 50%);
        background: rgb(var(--rgb-layout-grid) / 8%);
    }

    &.dragOver {
        border-color: rgb(var(--rgb-layout-grid) / 80%);
        border-width: 0.2rem;
        background: rgb(var(--rgb-layout-grid) / 15%);
        box-shadow: 0 0 0 0.4rem rgb(var(--rgb-layout-grid) / 20%);
    }

    &.gridFull {
        border-color: rgb(var(--rgb-danger, 239 68 68) / 60%);
        border-style: dashed;
        border-width: 0.2rem;
        background: rgb(var(--rgb-danger, 239 68 68) / 8%);
        cursor: not-allowed;
    }

    &[data-grid-variant='lead-left'],
    &[data-grid-variant='lead-right'] {
        grid-auto-flow: dense;
    }

    &[data-grid-variant='lead-left'] {
        > :global([data-layout-drop-item='true']:nth-of-type(1)) {
            grid-column: span var(--bricks-grid-accent-span, 2);
        }
    }

    &[data-grid-variant='lead-right'] {
        > :global([data-layout-drop-item='true']:nth-last-of-type(1)) {
            grid-column: span var(--bricks-grid-accent-span, 2);
        }
    }
}

.gridHidden {
    border-color: transparent;
    background: transparent;

    &:hover {
        border-color: transparent;
        background: transparent;
    }
}

.emptyPlaceholder {
    padding: 4rem 2rem;
    text-align: center;
    font-size: 1.4rem;
    font-weight: 500;
    color: rgb(var(--rgb-layout-grid) / 50%);
    grid-column: 1 / -1;
    pointer-events: none;
}
</style>
