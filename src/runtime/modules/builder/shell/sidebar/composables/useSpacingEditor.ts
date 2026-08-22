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

/** Default stepper step, used when the definition sets no `step` */
const DEFAULT_SPACING_STEP = 0.2;

/**
 * Formats the value of a side with no trailing zeros (`1.2`, not `1.20`).
 *
 * @param value - Numeric value of the side.
 * @returns String to display.
 */
export function formatSpacingValue(value: number): string {
    return String(Math.round(value * 10) / 10);
}

/**
 * Coerces a property value to a number: strings arrive from the inputs, undefined
 * becomes 0.
 *
 * @param value - Raw value of the property.
 * @returns Number rounded to one decimal place.
 */
function toNumberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 0;
}

/**
 * Assembles the stepper slot of an editable side.
 *
 * @param side - Side of the box model.
 * @param variant - Property variant from the panel.
 * @returns Stepper slot.
 */
function makeStepperSlot(side: TSpacingSideKey, variant: IComponentVariant): ISpacingStepperSlot {
    return { kind: 'stepper', side, variant, value: toNumberValue(variant.value) };
}

/**
 * Clamps the value to the min/max range of the property and rounds it to one decimal
 * place.
 *
 * @param slot - Slot of the editable side.
 * @param value - Candidate value.
 * @returns Value ready to be written into the props.
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
 * Logic of the composite box-model editor of a spacing group: the variants laid out
 * over the sides (steppers plus the read-only mirrors of the paired paddingX and
 * paddingY), the stepper step and the inline input of a value.
 *
 * @param props - Props of the spacing editor: the variants of the group and the write
 *   handler.
 * @returns The slots of the sides, the state of the inline input and the handlers.
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

    /** The margin variant: the steppers stand outside the "block", with no outer box-model frame */
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
     * Moves the value of a side by one stepper step; a mirror slot is ignored.
     *
     * @param slot - Slot of the editable side.
     * @param direction - Direction of the change, 1 or -1.
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
     * Turns on the inline input of the value on a click on the number.
     *
     * @param slot - Slot of the editable side.
     */
    function startEdit(slot: TSpacingSlot): void {
        if (slot.kind !== 'stepper') {
            return;
        }
        editingSide.value = slot.side;
        editingValue.value = formatSpacingValue(slot.value);
    }

    /**
     * Commits the inline input: parses, clamps and writes the value.
     *
     * @param slot - Slot of the editable side.
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
     * Cancels the inline input, writing nothing.
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
