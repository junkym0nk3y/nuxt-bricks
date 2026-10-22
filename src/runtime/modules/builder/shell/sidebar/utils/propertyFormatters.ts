/**
 * Utilities that format the property values of components.
 */

// Types
import type { TPrimitiveArrayValue } from '../types/sidebarProperties';

/**
 * Whether the array is a primitive one: every element is a string, a number, a boolean
 * — or empty, since `null` and `undefined` pass the check as well.
 *
 * The holes stay in the narrowed type for that reason: promising an array of primitives
 * would tell the next consumer the check rules them out, and it does not.
 *
 * @param value - Value to check.
 * @returns True when the array holds no complex values.
 */
export function isPrimitiveArrayValue(value: unknown): value is TPrimitiveArrayValue {
    return (
        Array.isArray(value) &&
        value.every(
            (item) =>
                item === null ||
                item === undefined ||
                ['string', 'number', 'boolean'].includes(typeof item)
        )
    );
}

/**
 * Formats a primitive array into a comma-separated string.
 *
 * @param value - Array of primitive values.
 * @returns String of the elements, separated by commas.
 */
export function formatPrimitiveArrayValue(value: unknown): string {
    if (!Array.isArray(value)) {
        return '';
    }

    return value.map((item) => String(item ?? '')).join(', ');
}

/**
 * Formats a value into an indented JSON string.
 *
 * @param value - Value to format.
 * @returns JSON string, or an empty string on a failure.
 */
function formatJsonDisplayValue(value: unknown): string {
    try {
        if (value === undefined || value === null) {
            return '';
        }
        return JSON.stringify(value, null, 2);
    } catch (error) {
        console.warn('[PropertyFormatters] Failed to stringify value', error);
        return String(value ?? '');
    }
}

/**
 * Formats a property value for display in an input field.
 *
 * @param value - Value to format.
 * @returns Formatted string.
 */
export function formatDisplayValue(value: unknown): string {
    if (typeof value === 'number') {
        return value.toString();
    }

    if (Array.isArray(value)) {
        if (isPrimitiveArrayValue(value)) {
            return formatPrimitiveArrayValue(value);
        }
        return formatJsonDisplayValue(value);
    }

    if (typeof value === 'object' && value !== null) {
        return formatJsonDisplayValue(value);
    }

    return String(value ?? '');
}

/**
 * Parses a comma-separated list string.
 *
 * @param value - String of comma-separated values.
 * @returns Array of the trimmed strings.
 */
export function parseListInput(value: string): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(/\s*,\s*/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}
