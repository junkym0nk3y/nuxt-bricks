// #region Imports
// Types
import type { ISidebarPropertySpacingEditorProps } from '../types/sidebarProperties';
import type { IUseSpacingEditorReturn } from '../types/composables';
import type {
    IComponentVariant,
    ISpacingStepperSlot,
    TSpacingSlot,
    TSpacingSideKey,
} from '../components/property-editors/types';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/** Шаг степпера по умолчанию, если в definition не задан `step`. */
const DEFAULT_SPACING_STEP = 0.2;

/**
 * Форматирует значение стороны без хвостовых нулей (`1.2`, не `1.20`).
 *
 * @param value - Числовое значение стороны.
 * @returns Строка для отображения.
 */
export function formatSpacingValue(value: number): string {
    return String(Math.round(value * 10) / 10);
}

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
 * Логика композитного box-model редактора spacing-группы: раскладка вариантов
 * по сторонам (степперы + read-only зеркала парных paddingX/paddingY),
 * шаг степпера и инлайн-ввод значения.
 *
 * @param props - Пропсы spacing-редактора (варианты группы + обработчик записи).
 * @returns Слоты сторон, состояние инлайн-ввода и обработчики.
 */
export function useSpacingEditor(
    props: ISidebarPropertySpacingEditorProps
): IUseSpacingEditorReturn {
    const { t } = useI18n();

    const editingSide = ref<TSpacingSideKey | null>(null);
    const editingValue = ref('');

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
        isMargin.value
            ? t('bricks.properties.spacing.block')
            : t('bricks.properties.spacing.content')
    );

    /**
     * Меняет значение стороны на шаг степпера (зеркальные слоты игнорируются).
     *
     * @param slot - Слот редактируемой стороны.
     * @param direction - Направление изменения (1 или -1).
     */
    function handleStep(slot: TSpacingSlot, direction: 1 | -1): void {
        if (slot.kind !== 'stepper') {
            return;
        }
        const step = slot.variant.property.step ?? DEFAULT_SPACING_STEP;
        const next = clampValue(slot, slot.value + direction * step);
        props.handleChangeValues(slot.variant.property, next);
    }

    /**
     * Включает инлайн-ввод значения по клику на число.
     *
     * @param slot - Слот редактируемой стороны.
     */
    function startEdit(slot: TSpacingSlot): void {
        if (slot.kind !== 'stepper') {
            return;
        }
        editingSide.value = slot.side;
        editingValue.value = formatSpacingValue(slot.value);
    }

    /**
     * Коммитит инлайн-ввод: парсит, клампит и записывает значение.
     *
     * @param slot - Слот редактируемой стороны.
     */
    function commitEdit(slot: TSpacingSlot): void {
        if (slot.kind !== 'stepper' || editingSide.value !== slot.side) {
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

    return {
        editingSide,
        editingValue,
        isMargin,
        contentLabel,
        topSlot,
        bottomSlot,
        leftSlot,
        rightSlot,
        handleStep,
        startEdit,
        commitEdit,
        cancelEdit,
    };
}
