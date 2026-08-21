/**
 * The shared primitives of server-first DTO validation (/api/bricks/**): the basic
 * type and bound checks and the rejection of unknown keys. Used by the validators of
 * pages (payloadValidation.ts) and of media (mediaPayloadValidation.ts).
 */
import { createError } from 'h3';

/** The length limit of the URL fields (socialImage/thumbnailUrl/media.url). */
export const MAX_URL_LENGTH = 2048;

/** The allowed format of the DTOs' external URL fields. */
export const HTTP_URL_PATTERN = /^https?:\/\//;

/** The validation rules of a string field. */
export interface IStringRule {
    min?: number;
    max: number;
    pattern?: RegExp;
    /** An explanation of the format for the error message (goes with pattern). */
    patternHint?: string;
}

/**
 * Throws a 400 with a message about the invalid field.
 *
 * @param message - The error's text.
 */
export function invalid(message: string): never {
    throw createError({ statusCode: 400, statusMessage: message });
}

/**
 * Rejects a body with unknown keys (400) — protection against the contract drifting
 * and against attempts to sneak fields past the validation.
 *
 * @param body - The normalized request body.
 * @param allowedKeys - The DTO's allowed camelCase keys.
 */
export function assertKnownKeys(
    body: Record<string, unknown>,
    allowedKeys: ReadonlySet<string>
): void {
    const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));

    if (unknownKeys.length > 0) {
        invalid(`Unknown fields: ${unknownKeys.join(', ')}`);
    }
}

/**
 * Validates a mandatory string against the rules.
 *
 * @param value - The field's raw value.
 * @param field - The field's name for the error message.
 * @param rule - The length/format rules.
 * @returns The string after a trim.
 */
export function requireString(value: unknown, field: string, rule: IStringRule): string {
    if (typeof value !== 'string') {
        invalid(`Field "${field}" must be a string`);
    }

    const trimmed = value.trim();

    if (rule.min !== undefined && trimmed.length < rule.min) {
        invalid(`Field "${field}" must be at least ${rule.min} characters`);
    }

    if (trimmed.length > rule.max) {
        invalid(`Field "${field}" must be at most ${rule.max} characters`);
    }

    if (rule.pattern && !rule.pattern.test(trimmed)) {
        invalid(
            `Field "${field}" has invalid format${rule.patternHint ? `: ${rule.patternHint}` : ''}`
        );
    }

    return trimmed;
}

/**
 * Validates an optional nullable string: undefined is "the field was not passed",
 * null and an empty string are normalized into null, and a non-empty one is checked
 * against the rules.
 *
 * @param value - The field's raw value.
 * @param field - The field's name for the error message.
 * @param rule - The length/format rules.
 * @returns The normalized value.
 */
export function optionalNullableString(
    value: unknown,
    field: string,
    rule: IStringRule
): string | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    if (typeof value !== 'string') {
        invalid(`Field "${field}" must be a string or null`);
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : requireString(trimmed, field, rule);
}

/**
 * Validates an optional boolean.
 *
 * @param value - The field's raw value.
 * @param field - The field's name for the error message.
 * @returns The value, or undefined when the field was not passed.
 */
export function optionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'boolean') {
        invalid(`Field "${field}" must be a boolean`);
    }

    return value;
}

/**
 * Validates a mandatory value as a positive safe integer. A shared helper for the
 * optimistic locking precondition fields (`expectedRevision` — both the page update
 * and the version restore) and for other strictly positive numeric DTO fields.
 *
 * @param value - The field's raw value.
 * @param field - The field's name for the error message.
 * @returns The number.
 */
export function requirePositiveInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        invalid(`Field "${field}" must be a positive integer`);
    }

    return value;
}
