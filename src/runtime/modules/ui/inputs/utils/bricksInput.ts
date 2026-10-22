// #region Imports
// Types
import type { IBricksInputProps } from '../types.d.ts';
// #endregion

/**
 * Normalizes incoming prop values to an editable string.
 *
 * @param value - External value.
 * @returns String representation of the value.
 */
export function normalizeIncomingValue(value: IBricksInputProps['value']): string {
    if (value === null || typeof value === 'undefined') {
        return '';
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    return String(value);
}

/**
 * Sanitizes user input according to the input type.
 *
 * @param value - Raw user input.
 * @param type - Input type; only 'slug' and 'number' are sanitized, 'text' and
 *     'password' pass through untouched.
 * @param min - Minimum allowed value (number inputs; non-negative min forbids leading minus).
 * @returns Sanitized string.
 */
export function sanitizeUserInput(
    value: string,
    type: IBricksInputProps['type'],
    min?: number
): string {
    if (type === 'slug') {
        return value
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-+/g, '');
    }

    if (type === 'number') {
        const sanitized = value.replace(/[^\d.-]/g, '');
        if (!sanitized) {
            return '';
        }

        const minNonNegative = typeof min === 'number' && min >= 0;
        const hasLeadingMinus = sanitized.startsWith('-') && !minNonNegative;
        const withoutMinus = sanitized.replace(/-/g, '');
        const [integerPartRaw, ...fractionParts] = withoutMinus.split('.');
        const integerPart = integerPartRaw ?? '';
        const fractionPart = fractionParts.join('');

        let normalized = integerPart;
        if (fractionPart.length > 0) {
            normalized += `.${fractionPart}`;
        }

        if (hasLeadingMinus) {
            normalized = normalized ? `-${normalized}` : '-';
        }

        return normalized;
    }

    return value;
}

/**
 * Rounds a number to the given step to get rid of floating point errors.
 *
 * @param value - Numeric value.
 * @param step - Rounding step.
 * @returns Rounded value.
 */
export function roundToStep(value: number, step: number): number {
    const precision = Math.max(0, Math.ceil(-Math.log10(step)));
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

/**
 * Clamps a numeric value to the optional min/max range.
 *
 * @param value - Value to clamp.
 * @param min - Optional lower bound.
 * @param max - Optional upper bound.
 * @returns Clamped value.
 */
export function clampToRange(value: number, min?: number, max?: number): number {
    let result = value;

    if (typeof min === 'number') {
        result = Math.max(min, result);
    }

    if (typeof max === 'number') {
        result = Math.min(max, result);
    }

    return result;
}
