<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarTablePicker } from '../../editor/types/text-editor-toolbar.d.ts';

// Vue
import { ref, computed } from 'vue';

// VueUse
import { onClickOutside, useElementBounding } from '@vueuse/core';
// #endregion

// #region Interfaces
interface IBricksTableGridPickerProps {
    item: IToolbarTablePicker;
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTableGridPickerProps>(), {});
// #endregion

// #region Data
const GRID_COLS = 8;
const GRID_ROWS = 6;

const triggerRef = ref<HTMLElement | null>(null);
const popupRef = ref<HTMLElement | null>(null);
const hoverCol = ref(0);
const hoverRow = ref(0);
const isOpen = ref(false);

const { bottom: triggerBottom, left: triggerLeft } = useElementBounding(triggerRef);
// #endregion

// #region Computed
/**
 * Текст подписи с текущим размером выбранной области.
 */
const sizeLabel = computed<string>(() => {
    if (hoverCol.value === 0 || hoverRow.value === 0) {
        return 'Выберите размер';
    }
    return `${hoverCol.value} × ${hoverRow.value}`;
});

/**
 * Стили позиционирования popup (fixed, привязка к триггер-кнопке).
 */
const popupStyle = computed(() => ({
    position: 'fixed' as const,
    top: `${triggerBottom.value + 4}px`,
    left: `${triggerLeft.value}px`,
    zIndex: 10001,
}));

/**
 * Показывать ли панель управления таблицей (когда курсор внутри таблицы).
 */
const showTableControls = computed<boolean>(() => props.item.isActive());
// #endregion

// #region Methods
/**
 * Обрабатывает наведение на ячейку сетки.
 */
function handleCellHover(col: number, row: number): void {
    hoverCol.value = col;
    hoverRow.value = row;
}

/**
 * Сбрасывает подсветку при уходе мыши.
 */
function handleGridLeave(): void {
    hoverCol.value = 0;
    hoverRow.value = 0;
}

/**
 * Вставляет таблицу с выбранным размером.
 */
function handleInsert(col: number, row: number): void {
    props.item.onInsert(row, col);
    isOpen.value = false;
}

/**
 * Переключает открытие/закрытие попапа.
 */
function togglePopup(): void {
    isOpen.value = !isOpen.value;
}

/**
 * Проверяет, подсвечена ли ячейка.
 */
function isCellHighlighted(col: number, row: number): boolean {
    return col <= hoverCol.value && row <= hoverRow.value;
}
// #endregion

// #region Lifecycle
onClickOutside(
    triggerRef,
    () => {
        isOpen.value = false;
    },
    { ignore: [popupRef] }
);
// #endregion
</script>

<template>
    <div :class="$style.BricksTableGridPicker" @mousedown.prevent>
        <button
            ref="triggerRef"
            type="button"
            :class="[$style.triggerButton, { [$style._active]: props.item.isActive() }]"
            :title="props.item.title"
            @mousedown.prevent
            @click.prevent="togglePopup"
        >
            <BricksIcon :icon="props.item.icon" />
        </button>

        <Teleport to="body">
            <Transition name="fade-fast">
                <div
                    v-if="isOpen"
                    ref="popupRef"
                    :class="$style.popup"
                    :style="popupStyle"
                    @mousedown.prevent
                >
                    <!-- Grid picker -->
                    <div :class="$style.gridSection">
                        <div :class="$style.gridLabel">{{ sizeLabel }}</div>
                        <div :class="$style.grid" @mouseleave="handleGridLeave">
                            <div
                                v-for="row in GRID_ROWS"
                                :key="`row-${row}`"
                                :class="$style.gridRow"
                            >
                                <button
                                    v-for="col in GRID_COLS"
                                    :key="`cell-${row}-${col}`"
                                    type="button"
                                    :class="[
                                        $style.gridCell,
                                        { [$style._highlighted]: isCellHighlighted(col, row) },
                                    ]"
                                    @mouseenter="handleCellHover(col, row)"
                                    @mousedown.prevent
                                    @click.prevent="handleInsert(col, row)"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- Table controls (when inside a table) -->
                    <template v-if="showTableControls">
                        <div :class="$style.divider" />

                        <div :class="$style.controlsSection">
                            <button
                                type="button"
                                :class="$style.controlButton"
                                @mousedown.prevent
                                @click.prevent="props.item.onAddRow()"
                            >
                                Добавить строку
                            </button>
                            <button
                                type="button"
                                :class="$style.controlButton"
                                @mousedown.prevent
                                @click.prevent="props.item.onAddColumn()"
                            >
                                Добавить столбец
                            </button>
                            <button
                                type="button"
                                :class="$style.controlButton"
                                @mousedown.prevent
                                @click.prevent="props.item.onDeleteRow()"
                            >
                                Удалить строку
                            </button>
                            <button
                                type="button"
                                :class="$style.controlButton"
                                @mousedown.prevent
                                @click.prevent="props.item.onDeleteColumn()"
                            >
                                Удалить столбец
                            </button>
                            <button
                                v-if="props.item.canMerge()"
                                type="button"
                                :class="$style.controlButton"
                                @mousedown.prevent
                                @click.prevent="props.item.onMergeCells()"
                            >
                                Объединить ячейки
                            </button>
                            <button
                                v-if="props.item.canSplit()"
                                type="button"
                                :class="$style.controlButton"
                                @mousedown.prevent
                                @click.prevent="props.item.onSplitCell()"
                            >
                                Разъединить ячейку
                            </button>

                            <div :class="$style.divider" />

                            <button
                                type="button"
                                :class="[$style.controlButton, $style._danger]"
                                @mousedown.prevent
                                @click.prevent="
                                    props.item.onDelete();
                                    isOpen = false;
                                "
                            >
                                Удалить таблицу
                            </button>
                        </div>
                    </template>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style module lang="scss">
.BricksTableGridPicker {
    display: inline-flex;
}

.triggerButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--toolbar-btn-size, 3.2rem);
    height: var(--toolbar-btn-size, 3.2rem);
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: transparent;
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--bricks-base-600);
    transition: all var(--default-transition);
    cursor: pointer;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }

    &:hover {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
    }

    &._active {
        border-color: var(--bricks-primary);
        background: var(--bricks-primary);
        color: #fff;
    }
}

.popup {
    display: flex;
    flex-direction: column;
    padding: 0.8rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    box-shadow: var(--shadow-md);
}

.gridSection {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.gridLabel {
    text-align: center;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.grid {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.gridRow {
    display: flex;
    gap: 0.2rem;
}

.gridCell {
    width: 2rem;
    height: 2rem;
    border-radius: 0.2rem;
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    transition:
        background var(--default-transition),
        border-color var(--default-transition);
    cursor: pointer;

    &._highlighted {
        border-color: var(--bricks-primary);
        background: var(--bricks-primary-100, rgb(99 102 241 / 15%));
    }
}

.divider {
    margin: 0.4rem 0;
    border-top: 1px solid var(--bricks-base-200);
}

.controlsSection {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.controlButton {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.4rem 0.8rem;
    border-radius: var(--border-radius-xs);
    border: none;
    background: transparent;
    text-align: left;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-700);
    transition:
        background var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    &:hover {
        background: var(--bricks-base-100);
    }

    &._danger {
        color: var(--bricks-danger-600, #dc2626);

        &:hover {
            background: var(--bricks-danger-50, #fef2f2);
        }
    }
}
</style>
