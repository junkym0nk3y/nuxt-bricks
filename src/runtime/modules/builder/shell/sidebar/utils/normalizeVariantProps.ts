// #region Imports
// Types
import type { IComponentVariant } from '../components/property-editors/types';
// #endregion

/**
 * Normalizes the data of a variant into the props of an editor component: select
 * (specs/facets), switch (the true/false values) and the base shape (label/value plus
 * the optional min/max/step/unit taken from the property).
 *
 * @param data - Data of the property variant.
 * @returns Normalized props object.
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
