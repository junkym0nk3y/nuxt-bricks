<script setup lang="ts">
// #region Imports
// Types
import type { ISidebarPropertyGridSizeEditorProps } from '../../types/sidebarProperties';
import type { IComponentVariant } from './types';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksInput from '../../../../../ui/inputs/BricksInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPropertyGridSizeEditorProps>(), {});
// #endregion

// #region Data
/**
 * Потолок наглядной сетки, а не свойства: значения больше вводятся числом в
 * полях под ней, сетка в этом случае честно упирается в край и показывает «⋯».
 */
const GRID_COLS = 8;
const GRID_ROWS = 6;

const { t } = useI18n();
const hoverCol = ref<number>(0);
const hoverRow = ref<number>(0);
// #endregion

// #region Computed
const columnsValue = computed<number>(() => toCellCount(props.columnsVariant.value));
const rowsValue = computed<number>(() => toCellCount(props.rowsVariant.value));

const isDisabled = computed<boolean>(
    () => props.columnsVariant.disabled || props.rowsVariant.disabled
);

const isHovering = computed<boolean>(() => hoverCol.value > 0 && hoverRow.value > 0);

/**
 * Размер под курсором — уже прижатый к диапазонам свойств: подсветка и подпись
 * обещают ровно то, что запишет клик. Иначе у свойства с `max: 4` наведение на
 * восьмую колонку обещало бы восемь, а записывались бы четыре.
 */
const hoveredColumns = computed<number>(() =>
    clampToPropertyRange(props.columnsVariant, hoverCol.value)
);
const hoveredRows = computed<number>(() => clampToPropertyRange(props.rowsVariant, hoverRow.value));

/** Живая подпись: под курсором показывает размер будущего клика, иначе текущий. */
const sizeLabel = computed<string>(() =>
    isHovering.value
        ? formatSize(hoveredColumns.value, hoveredRows.value)
        : formatSize(columnsValue.value, rowsValue.value)
);

const hasOverflow = computed<boolean>(
    () => columnsValue.value > GRID_COLS || rowsValue.value > GRID_ROWS
);

const overflowHint = computed<string>(() =>
    t('bricks.properties.gridSize.overflow', { cols: GRID_COLS, rows: GRID_ROWS })
);

const columnsFieldValue = computed<string>(() => formatFieldValue(props.columnsVariant.value));
const rowsFieldValue = computed<string>(() => formatFieldValue(props.rowsVariant.value));
// #endregion

// #region Methods
/**
 * Приводит значение свойства к числу ячеек: дробное усечь, мусор и пустое — 0
 * (ни одна ячейка не подсвечена, значение видно в поле).
 *
 * @param value - Сырое значение свойства из варианта панели.
 * @returns Неотрицательное целое число ячеек.
 */
function toCellCount(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

/**
 * Собирает подпись размера «N × M».
 *
 * @param cols - Количество колонок.
 * @param rows - Количество строк.
 * @returns Строка подписи.
 */
function formatSize(cols: number, rows: number): string {
    return `${cols} × ${rows}`;
}

/**
 * Готовит значение для числового поля: пустое свойство остаётся пустым полем,
 * а не нулём, которого в схеме нет.
 *
 * @param value - Сырое значение свойства.
 * @returns Строка для BricksInput.
 */
function formatFieldValue(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
}

/**
 * Подсвечена ли ячейка текущим значением свойств.
 *
 * @param col - Номер колонки (с 1).
 * @param row - Номер строки (с 1).
 * @returns Признак попадания в текущий прямоугольник.
 */
function isCellSelected(col: number, row: number): boolean {
    return col <= columnsValue.value && row <= rowsValue.value;
}

/**
 * Попадает ли ячейка в прямоугольник под курсором. Наведение перекрывает
 * текущее значение намеренно: «куда кликнешь» должно читаться сильнее.
 *
 * @param col - Номер колонки (с 1).
 * @param row - Номер строки (с 1).
 * @returns Признак попадания в подсветку.
 */
function isCellHovered(col: number, row: number): boolean {
    return isHovering.value && col <= hoveredColumns.value && row <= hoveredRows.value;
}

/**
 * Запоминает ячейку под курсором для подсветки и живой подписи.
 *
 * @param col - Номер колонки (с 1).
 * @param row - Номер строки (с 1).
 */
function handleCellHover(col: number, row: number): void {
    hoverCol.value = col;
    hoverRow.value = row;
}

/**
 * Сбрасывает подсветку, когда курсор уходит с сетки.
 */
function handleGridLeave(): void {
    hoverCol.value = 0;
    hoverRow.value = 0;
}

/**
 * Прижимает номер ячейки к диапазону свойства: сетка предлагает одни и те же
 * 8×6 любому блоку с парой «колонки/строки», а у свойства может быть свой
 * min/max — числовое поле его соблюдает, и клик по сетке обязан тоже.
 *
 * @param variant - Вариант редактируемого свойства.
 * @param value - Номер ячейки, выбранный в сетке.
 * @returns Значение внутри диапазона свойства.
 */
function clampToPropertyRange(variant: IComponentVariant, value: number): number {
    const { min, max } = variant.property;
    let next = value;

    if (typeof min === 'number') {
        next = Math.max(min, next);
    }

    if (typeof max === 'number') {
        next = Math.min(max, next);
    }

    return next;
}

/**
 * Пишет оба свойства одним кликом по ячейке. Запись идёт двумя вызовами
 * общего обработчика панели — он же решает, писать в базовый проп или в
 * override активного устройства.
 *
 * @param col - Номер колонки (с 1).
 * @param row - Номер строки (с 1).
 */
function handleCellClick(col: number, row: number): void {
    props.handleChangeValues(
        props.columnsVariant.property,
        clampToPropertyRange(props.columnsVariant, col)
    );
    props.handleChangeValues(
        props.rowsVariant.property,
        clampToPropertyRange(props.rowsVariant, row)
    );
}

/**
 * Пробрасывает ручной ввод числового поля (значения вне сетки — только отсюда).
 *
 * @param variant - Вариант редактируемого свойства.
 * @param value - Новое значение поля.
 */
function handleFieldChange(variant: IComponentVariant, value: string): void {
    props.handleChangeValues(variant.property, value);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPropertyGridSizeEditor">
        <span :class="$style.fieldLabel">{{ t('bricks.properties.gridSize.label') }}:</span>

        <div :class="[$style.box, isDisabled && $style._disabled]">
            <div :class="[$style.sizeLabel, isHovering && $style._hovered]">{{ sizeLabel }}</div>

            <div :class="$style.gridRow">
                <div :class="$style.grid" @mouseleave="handleGridLeave">
                    <div v-for="row in GRID_ROWS" :key="`row_${row}`" :class="$style.gridLine">
                        <button
                            v-for="col in GRID_COLS"
                            :key="`cell_${row}_${col}`"
                            type="button"
                            tabindex="-1"
                            :class="[
                                $style.cell,
                                isCellSelected(col, row) && $style._selected,
                                isCellHovered(col, row) && $style._hovered,
                            ]"
                            :disabled="isDisabled"
                            :aria-label="formatSize(col, row)"
                            @mouseenter="handleCellHover(col, row)"
                            @click="handleCellClick(col, row)"
                        />
                    </div>
                </div>

                <span v-if="hasOverflow" :class="$style.overflowMark" aria-hidden="true">⋯</span>
            </div>

            <div :class="$style.divider" />

            <div :class="$style.fields">
                <div :class="$style.field">
                    <BricksInput
                        :value="columnsFieldValue"
                        :label="props.columnsVariant.label"
                        type="number"
                        :min="props.columnsVariant.property.min"
                        :max="props.columnsVariant.property.max"
                        :step="props.columnsVariant.property.step"
                        :disabled="props.columnsVariant.disabled"
                        @update:value="handleFieldChange(props.columnsVariant, $event)"
                    />
                </div>

                <div :class="$style.field">
                    <BricksInput
                        :value="rowsFieldValue"
                        :label="props.rowsVariant.label"
                        type="number"
                        :min="props.rowsVariant.property.min"
                        :max="props.rowsVariant.property.max"
                        :step="props.rowsVariant.property.step"
                        :disabled="props.rowsVariant.disabled"
                        @update:value="handleFieldChange(props.rowsVariant, $event)"
                    />
                </div>
            </div>

            <span v-if="hasOverflow" :class="$style.overflowHint">{{ overflowHint }}</span>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyGridSizeEditor {
    display: flex;
    margin-bottom: 1.6rem;
    flex-direction: column;

    &:last-child {
        margin-bottom: 0;
    }
}

.fieldLabel {
    margin-bottom: 0.8rem;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-900);
    user-select: none;
}

.box {
    display: flex;
    align-items: center;
    padding: 0.8rem;
    border-radius: var(--bricks-border-radius-control);
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);
    flex-direction: column;
    gap: 0.8rem;

    &._disabled {
        .sizeLabel {
            color: var(--bricks-base-400);
        }

        .cell {
            border-color: var(--bricks-base-200);
            background-color: var(--bricks-base-100);
            cursor: default;

            &._selected {
                background-color: var(--bricks-base-200);
            }
        }
    }
}

.sizeLabel {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-900);
    transition: color var(--bricks-default-transition);
    user-select: none;

    &._hovered {
        color: var(--bricks-primary);
    }
}

.gridRow {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
}

.grid {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.gridLine {
    display: flex;
    gap: 0.2rem;
}

.cell {
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-radius: 0.2rem;
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-50);
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &._selected {
        border-color: var(--bricks-primary);
        background-color: var(--bricks-primary-100);
    }

    &._hovered {
        border-color: var(--bricks-primary);
        background-color: var(--bricks-primary);
    }
}

// Маркер «значение не влезло в сетку» стоит у первой строки, а не по центру:
// сетка заканчивается там, где кончается наглядность, и это видно сразу
.overflowMark {
    font-size: 1.2rem;
    line-height: 2rem;
    color: var(--bricks-primary);
    user-select: none;
}

.divider {
    width: 100%;
    height: 1px;
    background-color: var(--bricks-base-200);
}

.fields {
    display: flex;
    width: 100%;
    gap: 1.2rem;
}

.field {
    flex: 1;
    min-width: 0;
}

.overflowHint {
    width: 100%;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-base-500);
    user-select: none;
}
</style>
