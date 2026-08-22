<script setup lang="ts">
/**
 * @description Composite editor of the grid size: a clickable grid, a live "N × M"
 * caption and two numeric fields for the values the grid cannot reach.
 *
 * The overflow marker stands next to the first row rather than in the middle of the
 * grid: the grid ends where it stops being illustrative, and that way it is visible
 * at once.
 */

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
 * Ceiling of the illustrative grid, not of the property: a larger value is typed into
 * the fields below it, and the grid then honestly runs into its edge and shows a "⋯".
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
 * The size under the cursor, already clamped to the ranges of the properties: the
 * highlight and the caption promise exactly what a click is going to write. Otherwise
 * a property with `max: 4` would promise eight on a hover over the eighth column and
 * store four.
 */
const hoveredColumns = computed<number>(() =>
    clampToPropertyRange(props.columnsVariant, hoverCol.value)
);
const hoveredRows = computed<number>(() => clampToPropertyRange(props.rowsVariant, hoverRow.value));

/**
 * Live caption: under the cursor it shows the size a click would write, otherwise the
 * current one
 */
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
 * Turns a property value into a number of cells: a fraction is truncated, garbage and
 * emptiness become 0 — no cell is highlighted then, and the value stays visible in the
 * field.
 *
 * @param value - Raw property value from the panel variant.
 * @returns Non-negative whole number of cells.
 */
function toCellCount(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

/**
 * Builds the "N × M" size caption.
 *
 * @param cols - Number of columns.
 * @param rows - Number of rows.
 * @returns Caption string.
 */
function formatSize(cols: number, rows: number): string {
    return `${cols} × ${rows}`;
}

/**
 * Prepares the value for the numeric field: an empty property stays an empty field
 * rather than becoming a zero the schema does not hold.
 *
 * @param value - Raw property value.
 * @returns String for BricksInput.
 */
function formatFieldValue(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
}

/**
 * Whether the cell is highlighted by the current values of the properties.
 *
 * @param col - Column number, counted from 1.
 * @param row - Row number, counted from 1.
 * @returns Whether the cell falls into the current rectangle.
 */
function isCellSelected(col: number, row: number): boolean {
    return col <= columnsValue.value && row <= rowsValue.value;
}

/**
 * Whether the cell falls into the rectangle under the cursor. The hover deliberately
 * overrides the current value: "where the click lands" has to read stronger.
 *
 * @param col - Column number, counted from 1.
 * @param row - Row number, counted from 1.
 * @returns Whether the cell falls into the highlight.
 */
function isCellHovered(col: number, row: number): boolean {
    return isHovering.value && col <= hoveredColumns.value && row <= hoveredRows.value;
}

/**
 * Remembers the cell under the cursor for the highlight and the live caption.
 *
 * @param col - Column number, counted from 1.
 * @param row - Row number, counted from 1.
 */
function handleCellHover(col: number, row: number): void {
    hoverCol.value = col;
    hoverRow.value = row;
}

/**
 * Clears the highlight when the cursor leaves the grid.
 */
function handleGridLeave(): void {
    hoverCol.value = 0;
    hoverRow.value = 0;
}

/**
 * Clamps a cell number to the range of the property: the grid offers the same 8×6 to
 * every block with a "columns/rows" pair, while a property may carry a min/max of its
 * own — the numeric field respects it, and a click on the grid has to as well.
 *
 * @param variant - Variant of the property being edited.
 * @param value - Cell number picked in the grid.
 * @returns Value inside the range of the property.
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
 * Writes both properties from a single click on a cell. The write goes as two calls of
 * the shared panel handler, and that handler is the one deciding whether it lands in
 * the base prop or in the override of the active device.
 *
 * @param col - Column number, counted from 1.
 * @param row - Row number, counted from 1.
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
 * Forwards the manual input of a numeric field — a value outside the grid can only
 * come from here.
 *
 * @param variant - Variant of the property being edited.
 * @param value - New value of the field.
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
