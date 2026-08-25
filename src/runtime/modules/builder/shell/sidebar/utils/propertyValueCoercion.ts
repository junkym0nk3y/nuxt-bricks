// #region Imports
// Types
import type { IPropertyDefinition } from '../../../../common/types/brick';
import type { TPrimitiveArrayValue } from '../types/sidebarProperties';

// Utils
import { isPrimitiveArrayValue, parseListInput } from './propertyFormatters';
// #endregion

/**
 * Picks the source of primitive values — the current one or the default — when either
 * of them is fit for parsing from a string.
 *
 * @param currentArray - Value taken from the components.
 * @param defaultArray - Default value from the configuration.
 * @returns Array of primitives, or null when there is no such source.
 */
function resolvePrimitiveSource(
    currentArray?: unknown[],
    defaultArray?: unknown[]
): TPrimitiveArrayValue | null {
    if (currentArray && isPrimitiveArrayValue(currentArray)) {
        return currentArray;
    }
    if (defaultArray && isPrimitiveArrayValue(defaultArray)) {
        return defaultArray;
    }
    return null;
}

/**
 * Converts a string value into an array of primitives, taking the type from a sample.
 *
 * @param rawValue - String value from the input.
 * @param primitiveSource - Primitive sample the type is read from.
 * @returns Array of values of the matching type.
 */
function parsePrimitiveArrayValue(
    rawValue: string,
    primitiveSource: TPrimitiveArrayValue | null
): unknown[] {
    const items = parseListInput(rawValue);
    if (!primitiveSource || primitiveSource.length === 0) {
        return items;
    }

    const sample = primitiveSource.find((item) => item !== undefined && item !== null);
    if (typeof sample === 'number') {
        return items.map((item) => Number(item)).filter((item) => !Number.isNaN(item));
    }
    if (typeof sample === 'boolean') {
        return items.map((item) => item.toLowerCase() === 'true');
    }

    return items;
}
/**
 * Tries to parse a complex array through JSON.
 *
 * @param rawValue - String value, expected to be JSON.
 * @returns The array, or null on a failure.
 */
function parseJsonArrayValue(rawValue: string): unknown[] | null {
    const trimmed = rawValue.trim();
    if (!trimmed) {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('[PropertyValueCoercion] Failed to parse JSON array', error);
        return null;
    }
}

/**
 * Rounds a number to get rid of IEEE 754 floating point noise, for example
 * 5.400000000000001 → 5.4.
 *
 * @param value - Numeric value.
 * @returns The number rounded to four decimal places.
 */
function roundFloatingPoint(value: number): number {
    return Math.round(value * 10000) / 10000;
}

/**
 * Coerces a value into a number, falling back to the current value.
 *
 * @param value - Incoming value (a string, a number or a boolean).
 * @param currentValue - Current value of the property.
 * @returns The coerced number, or null on a failure.
 */
export function coerceNumberValue(value: unknown, currentValue: unknown): number | null {
    if (typeof value === 'number') {
        return roundFloatingPoint(value);
    }

    if (typeof value === 'string') {
        if (value.trim() === '') {
            return Number(currentValue) || 0;
        }

        const numValue = Number(value);
        if (Number.isNaN(numValue)) {
            console.warn('[PropertyValueCoercion] Invalid number value', value);
            return null;
        }
        return roundFloatingPoint(numValue);
    }

    if (typeof value === 'boolean') {
        return Number(value);
    }

    const fallback = Number(currentValue);
    if (!Number.isNaN(fallback)) {
        return fallback;
    }

    return 0;
}

/**
 * Coerces a value into an array, taking the type of its elements into account.
 *
 * @param property - Property definition.
 * @param value - Incoming value.
 * @param currentValue - Current value of the property.
 * @returns The coerced array, or null on a failure.
 */
export function coerceArrayValue(
    property: IPropertyDefinition,
    value: unknown,
    currentValue: unknown
): unknown[] | null {
    if (Array.isArray(value)) {
        return value;
    }

    const currentArray = Array.isArray(currentValue) ? currentValue : undefined;
    const defaultArray = Array.isArray(property.default) ? property.default : undefined;
    const primitiveSource = resolvePrimitiveSource(currentArray, defaultArray);
    const stringValue = typeof value === 'string' ? value : String(value ?? '');
    const shouldUsePrimitive = Boolean(primitiveSource) || (!currentArray && !defaultArray);

    if (shouldUsePrimitive) {
        return parsePrimitiveArrayValue(stringValue, primitiveSource);
    }

    return parseJsonArrayValue(stringValue);
}

/**
 * Coerces a value into an object by parsing it as JSON.
 *
 * @param property - Property definition.
 * @param value - Incoming value.
 * @param currentValue - Current value of the property.
 * @returns The coerced object or array, or null on a failure.
 */
export function coerceObjectValue(
    property: IPropertyDefinition,
    value: unknown,
    currentValue: unknown
): Record<string, unknown> | Array<unknown> | null {
    if (typeof value === 'object' && value !== null) {
        return value as Record<string, unknown> | Array<unknown>;
    }

    const stringValue = typeof value === 'string' ? value : String(value ?? '');
    if (!stringValue.trim()) {
        return {};
    }

    try {
        const parsed = JSON.parse(stringValue);
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed as Record<string, unknown> | Array<unknown>;
        }
        console.warn('[PropertyValueCoercion] Parsed value is not an object', parsed);
        return currentValue && typeof currentValue === 'object'
            ? (currentValue as Record<string, unknown>)
            : (property.default as Record<string, unknown> | Array<unknown> | null);
    } catch (error) {
        console.error('[PropertyValueCoercion] Failed to parse JSON object', error);
        return null;
    }
}
