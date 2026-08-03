<script setup lang="ts">
// #region Imports
// Types
import type { IBlockGridProps, TGridLayoutVariant, TGridRowHeight } from '../types/blockProps';

// Vue
import {
    computed,
    ref,
    inject,
    nextTick,
    onMounted,
    onBeforeUnmount,
    watch,
    useCssModule,
    type Ref,
    type Slot,
} from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { calculateGridDropTargetIndex } from '../utils/gridDropPlacement';
import { countSlotContent } from '../utils/slotContent';

// Composables
import { useLayoutDropZone } from '../composables/useLayoutDropZone';

// Components
import BlockGridOverlay from './BlockGridOverlay.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockGridProps>(), {});

const slots = defineSlots<{
    default?: Slot;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
const styles = useCssModule();
const gridRef = ref<HTMLElement | null>(null);
const containerSize = ref({ width: 0, height: 0 });

/** Грид заполнен и drop невозможен (визуальная обратная связь) */
const isGridFull = ref(false);

/** Реальные размеры строк грида из DOM */
const actualRowSizes = ref<number[]>([]);
// #endregion

// #region Computed

const childCount = computed<number>(() => countSlotContent(slots.default?.()));

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
 * Пол высоты незаполненной строки грида на канвасе. Без него объявленные, но ещё
 * не занятые контентом строки сжимаются в ноль.
 */
const EMPTY_ROW_MIN_HEIGHT = '4rem';

/**
 * Сколько строк уже занято контентом. Auto-placement заполняет грид по строкам,
 * поэтому оценка идёт по числу детей; элемент, растянутый на несколько ячеек
 * (bento-варианты), даёт заниженную оценку — такой строке достанется пол, но для
 * содержимого выше 4rem `minmax` ведёт себя как `auto`, и раскладка не меняется.
 */
const occupiedRows = computed<number>(() =>
    Math.min(normalizedRows.value, Math.ceil(childCount.value / normalizedColumns.value))
);

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

    // Строки без контента имеют нулевую высоту, а gap между ними остаётся:
    // шесть заданных строк не влезают в min-height блока, и на канвасе виден
    // один ряд вместо заданных — бросить компонент в третью строку некуда.
    // Пол по высоте делает объявленную структуру видимой; занятые строки
    // остаются на `auto`, чтобы канвас не врал про высоту контента.
    // Опубликованной страницы это не касается: там пустые строки ничего не
    // рисуют, а рендер идёт отдельным кодом (renderPublished в definition).
    const filled = occupiedRows.value;
    if (filled >= rows) {
        return `repeat(${rows}, ${height})`;
    }

    const emptyTracks = `repeat(${rows - filled}, minmax(${EMPTY_ROW_MIN_HEIGHT}, auto))`;
    return filled > 0 ? `repeat(${filled}, ${height}) ${emptyTracks}` : emptyTracks;
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

/**
 * Прижимает место вставки к целевой ячейке вне потока грида.
 *
 * Обычный flow-плейсхолдер здесь становится лишним grid-item: при заполненном
 * гриде auto-placement добавлял неявный ряд, грид «подрастал», а вместе с ним
 * ехала геометрия — расчёт ячейки под курсором начинал врать. Абсолютный элемент
 * позиционируется по своей grid-area и на раскладку не влияет.
 *
 * @param targetIndex - Индекс ячейки под курсором.
 * @returns Inline-стили плейсхолдера (kebab-case).
 */
function resolvePlaceholderCell(targetIndex: number): Record<string, string> {
    const columns = normalizedColumns.value;

    // Новый компонент встаёт в конец списка детей: обе точки вставки в сторе
    // (addChildToLayout, moveComponentToLayout) прижимают индекс к их числу.
    // Плейсхолдер обязан показывать ту же ячейку — иначе он обещает шестую
    // строку пустого грида, а компонент появляется в первой.
    const cellIndex = Math.min(targetIndex, childCount.value);

    // span обязателен: у абсолютного grid-child конец области по умолчанию
    // привязывается к краю контейнера, и плейсхолдер растягивался до низа грида.
    return {
        position: 'absolute',
        'grid-column': `${(cellIndex % columns) + 1} / span 1`,
        'grid-row': `${Math.floor(cellIndex / columns) + 1} / span 1`,
        inset: '0',
        width: 'auto',
        height: 'auto',
    };
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
        placeholderClass: styles.dropPlaceholder,
        resolvePlaceholderStyle: resolvePlaceholderCell,
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

// #region Watchers
// Сетка-подложка рисуется по ИЗМЕРЕННЫМ трекам, а измерение обновляют только
// resize окна и ResizeObserver. Смена числа строк или высоты строки габариты
// блока не меняет (их держит min-height), поэтому без этого пересчёта подложка
// остаётся от прежнего значения: панель показывает одну строку, а на канвасе
// видны прежние четыре. Колонки в списке по той же причине: смена их числа
// перекладывает детей и меняет высоты строк, а сумма высот может остаться
// прежней — наблюдатель размера тогда молчит.
watch(
    [normalizedRows, normalizedColumns, rowHeight, minRowHeight, normalizedGap, childCount],
    async () => {
        await nextTick();
        updateSize();
    }
);
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
    </div>
</template>

<style module lang="scss">
.BlockGrid {
    --bricks-grid-accent-span: 2;

    position: relative;
    min-width: 0;
    border: 1px dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

    > :global([data-layout-drop-item='true']) {
        overflow: hidden;
        min-width: 0;
        min-height: 0;
        grid-row: span 1; // Ограничиваем элемент одной строкой
    }

    // Кольцо hover/выделения рисует BuilderCanvasItem — здесь только подсветка зоны.
    &:hover {
        border-color: var(--bricks-primary);
        background: color-mix(in srgb, var(--bricks-primary) 6%, var(--bricks-base-50));
    }

    &.dragOver[data-layout-drop-active='true'] {
        border-color: var(--bricks-primary);
        background: color-mix(in srgb, var(--bricks-primary) 6%, var(--bricks-base-50));
        box-shadow: var(--bricks-canvas-ring-active);
    }

    &.gridFull {
        border-color: color-mix(in srgb, var(--bricks-danger-500) 60%, transparent);
        border-style: dashed;
        background: color-mix(in srgb, var(--bricks-danger-500) 8%, var(--bricks-base-50));
        box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--bricks-danger-500) 60%, transparent);
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
        box-shadow: none;
    }
}

.dropPlaceholder {
    box-sizing: border-box;
    align-self: stretch;
    width: 100%;
    height: var(--bricks-drag-placeholder-height);
    border: 0.2rem dashed var(--bricks-primary);
    background: color-mix(in srgb, var(--bricks-primary) 7%, transparent);
    pointer-events: none;
}
</style>
