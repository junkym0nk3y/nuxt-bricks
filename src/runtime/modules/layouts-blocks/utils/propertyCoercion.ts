/**
 * Coercion of untrusted block property values, shared by the canvas and the published
 * render.
 *
 * Pure on purpose: the registry coerces every property through here, and a published
 * render that reads raw schema props has to fold a value the same way. A second
 * implementation of these rules is what makes a block look one way in the editor and
 * another on the page.
 */

// #region Imports
// Types
import type { ILayoutProperty } from '../../common/types/layoutProperty';
// #endregion

/**
 * Folds a value into the number a `number` property promises.
 *
 * @param value - Raw value out of the schema or a device override.
 * @param defaultValue - Default declared by the property.
 * @param min - Lower bound declared by the property, when it has one.
 * @param max - Upper bound declared by the property, when it has one.
 * @returns A finite number within the declared bounds.
 */
export function coerceNumberProperty(
    value: unknown,
    defaultValue: unknown,
    min?: number,
    max?: number
): number {
    let numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        numeric = Number(defaultValue) || 0;
    }

    if (min !== undefined) {
        numeric = Math.max(min, numeric);
    }

    if (max !== undefined) {
        numeric = Math.min(max, numeric);
    }

    return numeric;
}

/**
 * Coerces a value according to its property definition.
 *
 * @param value - Raw value out of props.
 * @param property - Property definition.
 * @returns Normalized value.
 */
export function coercePropertyValue(value: unknown, property: ILayoutProperty): unknown {
    if (property.type === 'number') {
        return coerceNumberProperty(value, property.default, property.min, property.max);
    }

    if (property.type === 'boolean') {
        return Boolean(value);
    }

    if (property.type === 'select' && property.options) {
        const isValid = property.options.some((option) => option.value === value);
        return isValid ? value : property.default;
    }

    return value;
}

/**
 * Coerces the declared properties of a block, the device overrides included.
 *
 * Needed by the published render: it reads the RAW schema props, while the canvas gets
 * them through the registry, which coerces. Without this the same schema gives a grid of
 * one column in the editor and of `Infinity` on the page, because only one of the two
 * ever consulted the property definition.
 *
 * @param properties - Property definitions of the block.
 * @param values - Raw props out of the schema.
 * @returns A copy with every declared property coerced, at the base and per device.
 */
export function coerceBlockProps(
    properties: ILayoutProperty[],
    values: Record<string, unknown>
): Record<string, unknown> {
    const coerceLevel = (level: Record<string, unknown>): Record<string, unknown> => {
        const out: Record<string, unknown> = { ...level };

        for (const property of properties) {
            if (property.name in out) {
                out[property.name] = coercePropertyValue(out[property.name], property);
            }
        }

        return out;
    };

    const coerced = coerceLevel(values);
    const responsive = coerced.responsive;

    if (responsive && typeof responsive === 'object') {
        const overrides: Record<string, unknown> = {};

        for (const [device, value] of Object.entries(responsive as Record<string, unknown>)) {
            overrides[device] =
                value && typeof value === 'object'
                    ? coerceLevel(value as Record<string, unknown>)
                    : value;
        }

        coerced.responsive = overrides;
    }

    return coerced;
}
