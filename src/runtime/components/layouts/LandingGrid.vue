<script setup lang="ts">
// #region Imports
// Types
import type { GridLayoutProps, GridLayoutVariant, GridRowHeight } from '../../types/landing';

// Vue
import { computed, ref, inject, onMounted, onBeforeUnmount, type Ref } from 'vue';

// Utils
import { convertPxToRem } from '../../utils/main';
// #endregion

// #region Props
const props = defineProps<{
    layoutProps: GridLayoutProps;
    layoutId?: string;
}>();

const slots = defineSlots<{
    default?: any;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
const gridRef = ref<HTMLElement | null>(null);
const containerSize = ref({ width: 0, height: 0 });
const isDragOver = ref(false);

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

const gridVariant = computed<GridLayoutVariant>(() => props.layoutProps.variant ?? 'default');

const gridAutoFlow = computed<string>(() =>
    gridVariant.value === 'default' ? 'row' : 'row dense'
);

const normalizedGap = computed<number>(() => Math.max(0, Number(props.layoutProps.gap) || 0));

const rowHeight = computed<GridRowHeight>(() => props.layoutProps.rowHeight ?? 'auto');

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
        '--landing-grid-accent-span': String(accentSpan.value),
    };

    const px = normalizedPaddingX.value;
    const py = normalizedPaddingY.value;

    if (px > 0 || py > 0) {
        style.padding = `${py}rem ${px}rem`;
    }

    return style;
});

const contentHeight = computed(() => containerSize.value.height);

const overlayStyle = computed<Record<string, string>>(() => {
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

const columnBoundaries = computed<number[]>(() => {
    const width = containerSize.value.width;
    const columns = normalizedColumns.value;

    if (width <= 0 || columns <= 0) {
        return [0];
    }

    const gap = normalizedGap.value;
    const totalGap = (columns - 1) * gap;
    const columnWidth = (width - totalGap) / columns;

    const boundaries: number[] = [0];
    let position = 0;

    for (let index = 0; index < columns; index += 1) {
        position += columnWidth;
        boundaries.push(position);

        if (index < columns - 1) {
            position += gap;
        }
    }

    boundaries[boundaries.length - 1] = width;
    return boundaries;
});

const gapRects = computed(() => {
    const width = containerSize.value.width;
    const columns = normalizedColumns.value;
    const gap = normalizedGap.value;

    if (width <= 0 || columns <= 1 || gap <= 0) {
        return [];
    }

    const totalGap = (columns - 1) * gap;
    const columnWidth = (width - totalGap) / columns;
    const rects: Array<{ x: number; width: number }> = [];

    let position = columnWidth;

    for (let index = 0; index < columns - 1; index += 1) {
        rects.push({
            x: position,
            width: gap,
        });

        position += gap + columnWidth;
    }

    return rects;
});

/**
 * Вычисляет границы строк для визуализации сетки.
 * Использует реальные размеры строк из DOM.
 */
const rowBoundaries = computed<number[]>(() => {
    const rowSizes = actualRowSizes.value;

    // Показываем сетку строк только если есть реальные данные о строках
    if (rowSizes.length <= 1) {
        return [];
    }

    const gap = normalizedGap.value;
    const boundaries: number[] = [0];
    let position = 0;

    for (let index = 0; index < rowSizes.length; index += 1) {
        position += rowSizes[index];
        boundaries.push(position);

        if (index < rowSizes.length - 1) {
            position += gap;
        }
    }

    return boundaries;
});

/**
 * Вычисляет прямоугольники горизонтальных gap между строками.
 * Использует реальные размеры строк из DOM.
 */
const horizontalGapRects = computed(() => {
    const width = containerSize.value.width;
    const rowSizes = actualRowSizes.value;
    const gap = normalizedGap.value;

    if (width <= 0 || rowSizes.length <= 1 || gap <= 0) {
        return [];
    }

    const rects: Array<{ y: number; height: number }> = [];
    let position = rowSizes[0];

    for (let index = 0; index < rowSizes.length - 1; index += 1) {
        rects.push({
            y: position,
            height: gap,
        });

        position += gap + rowSizes[index + 1];
    }

    return rects;
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
 * Устанавливает dropEffect на основе типа перетаскиваемого элемента.
 * Без явного dropEffect браузер может отклонить drop.
 *
 * @param event - Текущее drag-событие.
 */
function updateDropEffect(event: DragEvent): void {
    if (!event.dataTransfer) {
        return;
    }

    const types = Array.from(event.dataTransfer.types || []);
    const isExisting = types.includes('component-id') || types.includes('text/plain');
    const isLibrary = types.includes('application/json');

    if (!isExisting && !isLibrary) {
        event.dataTransfer.dropEffect = 'none';
        return;
    }

    event.dataTransfer.dropEffect = isExisting ? 'move' : 'copy';
}

/**
 * Обрабатывает вход курсора в область Grid layout во время перетаскивания.
 * Без preventDefault на dragenter браузер может не считать Grid валидной drop-зоной.
 *
 * @param event - Текущее dragenter-событие.
 */
function handleDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    isDragOver.value = true;
    updateDropEffect(event);
}

/**
 * Activates drag-over state and allows dropping on the layout.
 *
 * @param event - Drag event triggered when an element is dragged over the layout.
 */
function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    updateDropEffect(event);

    // Во время dragover нельзя прочитать данные из dataTransfer (security),
    // но можно проверить types. Если есть component-id — это перемещение
    // существующего компонента (возможно внутри этого же грида → swap).
    // Блокируем только добавление новых из библиотеки при полном гриде.
    const types = Array.from(event.dataTransfer?.types || []);
    const isExistingComponent = types.includes('component-id');

    if (!isExistingComponent && checkGridAtCapacity()) {
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'none';
        }
        isGridFull.value = true;
        isDragOver.value = false;
        return;
    }

    isGridFull.value = false;
    isDragOver.value = true;
}

/**
 * Clears drag-over state when pointer leaves the layout.
 *
 * @param event - Drag event fired when leaving the drop zone.
 */
function handleDragLeave(event: DragEvent): void {
    event.stopPropagation();
    isDragOver.value = false;
    isGridFull.value = false;
}

/**
 * Вычисляет targetIndex (ячейку грида) по позиции курсора.
 * Учитывает CSS transform (canvas scale), padding и реальный gap из computed style.
 *
 * @param event - Drop-событие с координатами курсора.
 * @returns targetIndex или null, если невозможно вычислить.
 */
function calculateDropTargetIndex(event: DragEvent): number | null {
    const rect = gridRef.value?.getBoundingClientRect();
    if (!rect || !gridRef.value) {
        return null;
    }

    // getBoundingClientRect() возвращает визуальные размеры (после canvas scale),
    // а CSS gap/padding — в CSS-пикселях. Для согласованного расчёта
    // читаем реальный gap из computed style и вычисляем масштаб.
    const computedStyle = window.getComputedStyle(gridRef.value);
    const cssGap = parseFloat(computedStyle.columnGap || computedStyle.gap || '0') || 0;
    const cssRowGap = parseFloat(computedStyle.rowGap || computedStyle.gap || '0') || 0;

    // Масштаб: отношение visual к CSS (учитывает transform: scale на canvas)
    const offsetW = gridRef.value.offsetWidth;
    const scale = offsetW > 0 ? rect.width / offsetW : 1;

    // Переводим gap в визуальные пиксели
    const visualGap = cssGap * scale;
    const visualRowGap = cssRowGap * scale;

    // Учитываем padding (тоже в визуальных пикселях)
    const padLeft = (parseFloat(computedStyle.paddingLeft) || 0) * scale;
    const padTop = (parseFloat(computedStyle.paddingTop) || 0) * scale;
    const padRight = (parseFloat(computedStyle.paddingRight) || 0) * scale;
    const padBottom = (parseFloat(computedStyle.paddingBottom) || 0) * scale;

    const columns = normalizedColumns.value;
    const contentWidth = rect.width - padLeft - padRight;
    const columnWidth = (contentWidth - (columns - 1) * visualGap) / columns;

    const x = event.clientX - rect.left - padLeft;
    let column = Math.floor(x / (columnWidth + visualGap));
    column = Math.max(0, Math.min(column, columns - 1));

    const rows = normalizedRows.value;
    const contentHeight = rect.height - padTop - padBottom;
    const availableHeight = contentHeight - (rows - 1) * visualRowGap;
    const singleRowHeight = availableHeight / rows;

    const y = event.clientY - rect.top - padTop;
    let row = Math.floor(y / (singleRowHeight + visualRowGap));
    row = Math.max(0, Math.min(row, rows - 1));

    return row * columns + column;
}

/**
 * Handles drop action and emits layout-drop event with positioning information.
 *
 * @param event - Drag event raised when an item is dropped inside the layout.
 */
function handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    isDragOver.value = false;
    isGridFull.value = false;

    const componentId = event.dataTransfer?.getData('component-id');

    if (componentId && props.layoutId && componentId === props.layoutId) {
        console.warn('[LandingGrid] Ignoring self drop attempt');
        return;
    }

    // Проверка ёмкости грида при фиксированных rows
    if (checkGridAtCapacity()) {
        const isMove = Boolean(componentId);

        // Перемещение внутри этого же грида — ёмкость не меняется, разрешаем
        if (isMove && componentId && isChildOfThisGrid(componentId)) {
            // Внутреннее перемещение — пропускаем проверку
        } else {
            console.warn('[LandingGrid] Grid is at capacity, ignoring drop');
            return;
        }
    }

    const targetIndex = calculateDropTargetIndex(event);
    if (targetIndex === null) {
        return;
    }

    const layoutDropEvent = new CustomEvent('layout-drop', {
        detail: {
            layoutId: props.layoutId,
            movedComponentId: componentId || null,
            targetIndex,
            swap: true,
        },
        bubbles: true,
    });
    gridRef.value?.dispatchEvent(layoutDropEvent);
}
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
            $style.gridLayout,
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
        <svg
            v-if="showGrid && containerSize.width > 0"
            :class="$style.gridOverlay"
            :style="overlayStyle"
            :width="containerSize.width"
            :height="containerSize.height"
            :viewBox="`0 0 ${containerSize.width} ${containerSize.height}`"
            preserveAspectRatio="none"
        >
            <!-- Vertical gap highlight (columns) -->
            <rect
                v-for="(gapRect, gapIndex) in gapRects"
                :key="`col-gap-${gapIndex}`"
                :x="gapRect.x"
                :y="0"
                :width="gapRect.width"
                :height="contentHeight"
                fill="rgb(var(--rgb-indigo) / 12%)"
            />

            <!-- Horizontal gap highlight (rows) -->
            <rect
                v-for="(gapRect, gapIndex) in horizontalGapRects"
                :key="`row-gap-${gapIndex}`"
                :x="0"
                :y="gapRect.y"
                :width="containerSize.width"
                :height="gapRect.height"
                fill="rgb(var(--rgb-indigo) / 12%)"
            />

            <!-- Vertical lines (columns) -->
            <line
                v-for="(position, index) in columnBoundaries"
                :key="`v-${index}`"
                :x1="position"
                :y1="0"
                :x2="position"
                :y2="containerSize.height"
                stroke="rgba(99, 102, 241, 0.4)"
                stroke-width="1"
            />

            <!-- Horizontal lines (rows) -->
            <line
                v-for="(position, index) in rowBoundaries"
                :key="`h-${index}`"
                :x1="0"
                :y1="position"
                :x2="containerSize.width"
                :y2="position"
                stroke="rgba(99, 102, 241, 0.4)"
                stroke-width="1"
            />
        </svg>

        <!-- Content -->
        <slot />

        <!-- Drop placeholder when empty -->
        <div v-if="isEmpty" :class="$style.emptyPlaceholder">Drop components here</div>
    </div>
</template>

<style module lang="scss">
.gridLayout {
    --landing-grid-accent-span: 2;

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
            grid-column: span var(--landing-grid-accent-span, 2);
        }
    }

    &[data-grid-variant='lead-right'] {
        > :global([data-layout-drop-item='true']:nth-last-of-type(1)) {
            grid-column: span var(--landing-grid-accent-span, 2);
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

.gridOverlay {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    pointer-events: none;
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
