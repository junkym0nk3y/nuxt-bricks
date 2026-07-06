<script setup lang="ts">
// #region Imports
// Types
import type { ISidebarPropertySpacingEditorProps } from '../../types/sidebarProperties';
import type {
    IComponentVariant,
    ISpacingStepperSlot,
    TSpacingSlot,
    TSpacingSideKey,
} from './types';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPropertySpacingEditorProps>(), {});
// #endregion

// #region Data
const { t } = useI18n();

/** Шаг степпера по умолчанию, если в definition не задан `step`. */
const DEFAULT_SPACING_STEP = 0.2;

const editingSide = ref<TSpacingSideKey | null>(null);
const editingValue = ref('');
// #endregion

// #region Computed
const variantByName = computed(() => {
    const map = new Map<string, IComponentVariant>();
    props.items.forEach((item) => {
        map.set(item.property.name, item);
    });
    return map;
});

/** Margin-вариант: степперы снаружи «блока», без внешней рамки box-model. */
const isMargin = computed(() =>
    props.items.every((item) => item.property.name.startsWith('margin'))
);

const topSlot = computed<ISpacingStepperSlot | null>(() => {
    const variant =
        variantByName.value.get('paddingTop') ||
        variantByName.value.get('marginTop') ||
        variantByName.value.get('paddingY');
    return variant ? makeStepperSlot('top', variant) : null;
});

const bottomSlot = computed<TSpacingSlot | null>(() => {
    const variant =
        variantByName.value.get('paddingBottom') || variantByName.value.get('marginBottom');
    if (variant) {
        return makeStepperSlot('bottom', variant);
    }

    const pairedY = variantByName.value.get('paddingY');
    if (pairedY) {
        return { kind: 'mirror', side: 'bottom', value: toNumberValue(pairedY.value) };
    }

    return null;
});

const leftSlot = computed<ISpacingStepperSlot | null>(() => {
    const variant = variantByName.value.get('paddingX');
    return variant ? makeStepperSlot('left', variant) : null;
});

const rightSlot = computed<TSpacingSlot | null>(() => {
    const pairedX = variantByName.value.get('paddingX');
    if (!pairedX) {
        return null;
    }
    return { kind: 'mirror', side: 'right', value: toNumberValue(pairedX.value) };
});

const contentLabel = computed(() =>
    isMargin.value ? t('bricks.properties.spacing.block') : t('bricks.properties.spacing.content')
);
// #endregion

// #region Methods
/**
 * Приводит значение свойства к числу (строки из инпутов, undefined → 0).
 *
 * @param value - Сырое значение свойства.
 * @returns Число, округлённое до одной десятой.
 */
function toNumberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 0;
}

/**
 * Собирает слот-степпер для редактируемой стороны.
 *
 * @param side - Сторона box-model.
 * @param variant - Вариант свойства из панели.
 * @returns Слот степпера.
 */
function makeStepperSlot(side: TSpacingSideKey, variant: IComponentVariant): ISpacingStepperSlot {
    return { kind: 'stepper', side, variant, value: toNumberValue(variant.value) };
}

/**
 * Форматирует значение без хвостовых нулей (`1.2`, не `1.20`).
 *
 * @param value - Числовое значение стороны.
 * @returns Строка для отображения.
 */
function formatValue(value: number): string {
    return String(Math.round(value * 10) / 10);
}

/**
 * Ограничивает значение диапазоном min/max свойства и округляет до одной десятой.
 *
 * @param slot - Слот редактируемой стороны.
 * @param value - Кандидат значения.
 * @returns Значение, готовое к записи в props.
 */
function clampValue(slot: ISpacingStepperSlot, value: number): number {
    const { min, max } = slot.variant.property;
    let next = value;
    if (typeof min === 'number') {
        next = Math.max(min, next);
    }
    if (typeof max === 'number') {
        next = Math.min(max, next);
    }
    return Math.round(next * 10) / 10;
}

/**
 * Возвращает локализованную подпись стороны для aria-атрибутов.
 *
 * @param side - Сторона box-model.
 * @returns Локализованная подпись.
 */
function sideLabel(side: TSpacingSideKey): string {
    return t(`bricks.properties.spacing.sides.${side}`);
}

/**
 * Меняет значение стороны на шаг степпера.
 *
 * @param slot - Слот редактируемой стороны.
 * @param direction - Направление изменения (1 или -1).
 */
function handleStep(slot: ISpacingStepperSlot, direction: 1 | -1): void {
    const step = slot.variant.property.step ?? DEFAULT_SPACING_STEP;
    const next = clampValue(slot, slot.value + direction * step);
    props.handleChangeValues(slot.variant.property, next);
}

/**
 * Включает инлайн-ввод значения по клику на число.
 *
 * @param slot - Слот редактируемой стороны.
 */
function startEdit(slot: ISpacingStepperSlot): void {
    editingSide.value = slot.side;
    editingValue.value = formatValue(slot.value);
}

/**
 * Коммитит инлайн-ввод: парсит, клампит и записывает значение.
 *
 * @param slot - Слот редактируемой стороны.
 */
function commitEdit(slot: ISpacingStepperSlot): void {
    if (editingSide.value !== slot.side) {
        return;
    }
    editingSide.value = null;

    const parsed = Number(editingValue.value.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
        return;
    }

    const next = clampValue(slot, parsed);
    if (next !== slot.value) {
        props.handleChangeValues(slot.variant.property, next);
    }
}

/**
 * Отменяет инлайн-ввод без записи значения.
 */
function cancelEdit(): void {
    editingSide.value = null;
}

/**
 * Фокусирует и выделяет инпут инлайн-ввода при его появлении.
 *
 * @param el - Элемент из function ref.
 */
function focusInput(el: unknown): void {
    if (el instanceof HTMLInputElement && document.activeElement !== el) {
        el.focus();
        el.select();
    }
}
// #endregion
</script>

<template>
    <div :class="[$style.BuilderShellSidebarPropertySpacingEditor, isMargin && $style._margin]">
        <div v-if="topSlot" :class="$style.edgeRow">
            <div :class="$style.stepper">
                <button
                    type="button"
                    :class="$style.stepBtn"
                    :disabled="topSlot.variant.disabled"
                    :aria-label="
                        t('bricks.properties.spacing.decrease', { side: sideLabel('top') })
                    "
                    @click="handleStep(topSlot, -1)"
                >
                    −
                </button>
                <input
                    v-if="editingSide === 'top'"
                    :ref="focusInput"
                    v-model="editingValue"
                    :class="$style.valueInput"
                    :aria-label="sideLabel('top')"
                    @blur="commitEdit(topSlot)"
                    @keydown.enter="commitEdit(topSlot)"
                    @keydown.esc="cancelEdit"
                />
                <button
                    v-else
                    type="button"
                    :class="$style.valueBtn"
                    :aria-label="sideLabel('top')"
                    @click="startEdit(topSlot)"
                >
                    {{ formatValue(topSlot.value) }}
                </button>
                <button
                    type="button"
                    :class="$style.stepBtn"
                    :disabled="topSlot.variant.disabled"
                    :aria-label="
                        t('bricks.properties.spacing.increase', { side: sideLabel('top') })
                    "
                    @click="handleStep(topSlot, 1)"
                >
                    +
                </button>
            </div>
        </div>

        <div :class="$style.middleRow">
            <div v-if="leftSlot" :class="$style.sideCell">
                <button
                    type="button"
                    :class="$style.stepBtn"
                    :disabled="leftSlot.variant.disabled"
                    :aria-label="
                        t('bricks.properties.spacing.decrease', { side: sideLabel('left') })
                    "
                    @click="handleStep(leftSlot, -1)"
                >
                    −
                </button>
                <input
                    v-if="editingSide === 'left'"
                    :ref="focusInput"
                    v-model="editingValue"
                    :class="$style.valueInput"
                    :aria-label="sideLabel('left')"
                    @blur="commitEdit(leftSlot)"
                    @keydown.enter="commitEdit(leftSlot)"
                    @keydown.esc="cancelEdit"
                />
                <button
                    v-else
                    type="button"
                    :class="$style.valueBtn"
                    :aria-label="sideLabel('left')"
                    @click="startEdit(leftSlot)"
                >
                    {{ formatValue(leftSlot.value) }}
                </button>
                <button
                    type="button"
                    :class="$style.stepBtn"
                    :disabled="leftSlot.variant.disabled"
                    :aria-label="
                        t('bricks.properties.spacing.increase', { side: sideLabel('left') })
                    "
                    @click="handleStep(leftSlot, 1)"
                >
                    +
                </button>
            </div>

            <div :class="$style.contentBox">{{ contentLabel }}</div>

            <div v-if="rightSlot" :class="$style.sideCell">
                <span
                    :class="$style.mirrorChip"
                    :aria-label="
                        t('bricks.properties.spacing.mirrored', { side: sideLabel('right') })
                    "
                >
                    {{ formatValue(rightSlot.value) }}
                </span>
            </div>
        </div>

        <div v-if="bottomSlot" :class="$style.edgeRow">
            <div v-if="bottomSlot.kind === 'stepper'" :class="$style.stepper">
                <button
                    type="button"
                    :class="$style.stepBtn"
                    :disabled="bottomSlot.variant.disabled"
                    :aria-label="
                        t('bricks.properties.spacing.decrease', { side: sideLabel('bottom') })
                    "
                    @click="handleStep(bottomSlot, -1)"
                >
                    −
                </button>
                <input
                    v-if="editingSide === 'bottom'"
                    :ref="focusInput"
                    v-model="editingValue"
                    :class="$style.valueInput"
                    :aria-label="sideLabel('bottom')"
                    @blur="commitEdit(bottomSlot)"
                    @keydown.enter="commitEdit(bottomSlot)"
                    @keydown.esc="cancelEdit"
                />
                <button
                    v-else
                    type="button"
                    :class="$style.valueBtn"
                    :aria-label="sideLabel('bottom')"
                    @click="startEdit(bottomSlot)"
                >
                    {{ formatValue(bottomSlot.value) }}
                </button>
                <button
                    type="button"
                    :class="$style.stepBtn"
                    :disabled="bottomSlot.variant.disabled"
                    :aria-label="
                        t('bricks.properties.spacing.increase', { side: sideLabel('bottom') })
                    "
                    @click="handleStep(bottomSlot, 1)"
                >
                    +
                </button>
            </div>
            <span
                v-else
                :class="$style.mirrorChip"
                :aria-label="t('bricks.properties.spacing.mirrored', { side: sideLabel('bottom') })"
            >
                {{ formatValue(bottomSlot.value) }}
            </span>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertySpacingEditor {
    display: flex;
    padding: 0.8rem;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);
    flex-direction: column;
    gap: 0.6rem;

    &._margin {
        padding: 0;
        border-radius: 0;
        border: none;
        background: none;

        .contentBox {
            border: none;
            background-color: var(--bricks-base-100);
        }
    }
}

.edgeRow {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
}

.middleRow {
    display: flex;
    align-items: stretch;
    gap: 0.6rem;
}

.sideCell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 3.6rem;
    gap: 0.2rem;
}

.contentBox {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 6.4rem;
    border-radius: 0.6rem;
    border: 1px dashed var(--bricks-base-300);
    font-size: 1.2rem;
    color: var(--bricks-base-500);
    user-select: none;
}

.stepper {
    display: flex;
    align-items: center;
    gap: 0.2rem;
}

.stepBtn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.4rem;
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);
    font-size: 1.2rem;
    line-height: 1;
    color: var(--bricks-base-600);
    transition:
        border-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;
    user-select: none;

    &:hover:not(:disabled) {
        border-color: var(--bricks-base-400);
        color: var(--bricks-base-900);
    }

    &:disabled {
        opacity: 0.4;
        cursor: default;
    }
}

.valueBtn {
    min-width: 3.6rem;
    height: 2rem;
    padding: 0 0.4rem;
    border-radius: 0.4rem;
    border: 1px solid transparent;
    background: none;
    font-size: 1.2rem;
    color: var(--bricks-base-900);
    transition: border-color var(--default-transition);
    cursor: text;
    font-variant-numeric: tabular-nums;

    &:hover {
        border-color: var(--bricks-base-200);
    }
}

.valueInput {
    width: 4.4rem;
    height: 2rem;
    padding: 0 0.4rem;
    border-radius: 0.4rem;
    border: 1px solid var(--bricks-primary);
    background-color: var(--bricks-base-0);
    outline: none;
    text-align: center;
    font-size: 1.2rem;
    color: var(--bricks-base-900);
    font-variant-numeric: tabular-nums;
}

.mirrorChip {
    font-size: 1.2rem;
    font-variant-numeric: tabular-nums;
    color: var(--bricks-base-500);
    opacity: 0.5;
    user-select: none;
}
</style>
