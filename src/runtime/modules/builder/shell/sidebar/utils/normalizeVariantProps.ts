// #region Imports
// Types
import type { IComponentVariant } from '../components/property-editors/types';
// #endregion

/**
 * Нормализует данные варианта в пропсы для компонента-редактора:
 * select (specs/facets), switch (true/false-значения) и базовая форма
 * (label/value + опциональные min/max/step/unit из property).
 *
 * @param data - Данные варианта свойства
 * @returns Нормализованный объект пропсов
 */
export function normalizeVariantProps(data: IComponentVariant): Record<string, unknown> {
    if (data.specs) {
        return {
            label: data.label,
            value: String(data.value),
            specs: data.specs,
            facets: data.facets,
        };
    }

    if (data.trueValue !== undefined || data.falseValue !== undefined) {
        return {
            label: data.label,
            value: data.value,
            trueValue: data.trueValue,
            trueLabel: data.trueLabel,
            falseValue: data.falseValue,
            falseLabel: data.falseLabel,
            size: data.size ?? 'small',
        };
    }

    const base: Record<string, unknown> = {
        label: data.label,
        value: data.value,
        disabled: data.disabled,
        placeholder: data.placeholder,
    };

    if (data.property?.min !== undefined) {
        base.min = data.property.min;
    }

    if (data.property?.max !== undefined) {
        base.max = data.property.max;
    }

    if (data.property?.step !== undefined) {
        base.step = data.property.step;
    }

    if (data.property?.unit) {
        base.unit = data.property.unit;
    }

    return base;
}
