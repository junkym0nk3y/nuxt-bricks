import type { IApiError, TRequestErrorLike } from '../types/bricks-api';
import { BRICKS_API_ERROR_CODES } from '../constants/apiErrors';

/** String values of a flag that count as "on" (env variables are strings) */
const TRUTHY_FLAG_VALUES = new Set(['true', '1', 'yes', 'on']);

/**
 * Coerces a runtimeConfig/env value into a boolean flag (a boolean from the
 * module options or a string from an env override).
 *
 * An empty string means "not set" rather than "off": a variable declared in
 * `.env` or in a compose file with no value reaches both the build and the built
 * application (Nitro overlays runtimeConfig with the `NUXT_*` values as they
 * are, an empty string included). Count it as "off" — and a flag defaulting to
 * "on" would silently go dark for everybody, the administrator included, because
 * of a single valueless line.
 *
 * @param value - Raw flag value.
 * @param fallback - Value for a flag that is not set (off by default).
 */
export function parseBricksBooleanFlag(value: unknown, fallback: boolean = false): boolean {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();

        return normalized === '' ? fallback : TRUTHY_FLAG_VALUES.has(normalized);
    }

    return value === null || value === undefined ? fallback : false;
}

/**
 * Converts values in pixels into rem units using the base value.
 *
 * @param valueInPixels - Size in pixels.
 * @param remBasePx - Base rem value in pixels (10 by default).
 * @returns Size in rem units.
 */
export function convertPxToRem(valueInPixels: number, remBasePx: number = 10): string {
    return `${valueInPixels / remBasePx}rem`;
}

/**
 * Converts values in rem back into pixels using the base value.
 *
 * @param valueInRem - Size in rem, may include the 'rem' suffix.
 * @param remBasePx - Base rem value in pixels (10 by default).
 * @returns Size in pixels.
 */
export function convertRemToPx(valueInRem: string | number, remBasePx: number = 10): number {
    const numericValue =
        typeof valueInRem === 'number'
            ? valueInRem
            : parseFloat(valueInRem.replace(/rem$/i, '').trim());

    if (Number.isNaN(numericValue)) {
        return 0;
    }

    return numericValue * remBasePx;
}

/**
 * Validates a hexadecimal color value.
 *
 * @param hex - Color value to check (with or without #).
 * @returns True if it is a valid hex color, false otherwise.
 */
export function validateHex(hex: string): boolean {
    if (!hex) {
        return false;
    }

    const stripped = hex.replace(/^#/, '');

    // Allowed lengths: 3 (RGB) or 6 (RRGGBB)
    if (stripped.length !== 3 && stripped.length !== 6) {
        return false;
    }

    // Check that every character is a valid hex digit
    return /^[0-9A-Fa-f]+$/.test(stripped);
}

/**
 * Normalizes a hexadecimal color value, always adding the # prefix.
 *
 * @param hex - Color value to normalize.
 * @returns Normalized hex color with the # prefix.
 */
export function normalizeHex(hex: string): string {
    if (!hex) {
        return '#000000';
    }

    let stripped = hex.replace(/^#/, '').toUpperCase();

    // Expand a 3-character hex to 6
    if (stripped.length === 3) {
        stripped = stripped
            .split('')
            .map((char) => char + char)
            .join('');
    }

    // Guarantee 6 characters, padding with zeros when needed
    while (stripped.length < 6) {
        stripped = '0' + stripped;
    }

    return `#${stripped}`;
}

/**
 * Normalizes any error into a structure suitable for createError.
 * Used for consistent formatting of the status and the message without leaking
 * internal details.
 *
 * @param error - Error object to normalize.
 * @param fallbackMessage - Default message when no specific one is found in the error.
 * @param fallbackStatus - Default status code when no specific one is found in the error.
 * @returns An object with statusCode and statusMessage.
 */
export function normalizeBricksError(
    error: unknown,
    fallbackMessage: string,
    fallbackStatus = 500
): { statusCode: number; statusMessage: string } {
    const normalized = (error ?? {}) as IApiError;

    return {
        statusCode:
            typeof normalized.statusCode === 'number' ? normalized.statusCode : fallbackStatus,
        statusMessage: normalized.statusMessage || normalized.message || fallbackMessage,
    };
}

/**
 * Extracts the machine-readable rejection code out of a request error: the
 * endpoint returns it in `data.code`, h3 serializes it into the response body,
 * and ofetch puts the body into `error.data` — so the code ends up two levels
 * deep. The fallback to `data.code` covers the shape without the nesting.
 *
 * Without reading the code the rejection would reach the user as an
 * English-language transport text (`[PUT] "/api/…": 504 …`): by their class,
 * contract rejections are indistinguishable from arbitrary ones.
 *
 * @param error - Request error.
 * @returns Rejection code or null.
 */
export function getBricksErrorCode(error: unknown): string | null {
    const payload = (error ?? {}) as TRequestErrorLike;
    const nested = (payload.data as { data?: { code?: unknown } } | undefined)?.data?.code;
    const code = nested ?? payload.data?.code;

    return typeof code === 'string' ? code : null;
}

/**
 * Recognizes the rejection where the database stopped the request by its own time
 * limit.
 *
 * Needed by both builder domains: with a client-side abort by the waiting ceiling
 * the outcome of a write is unknown, whereas here it is definitely rolled back,
 * and the texts have to differ.
 *
 * @param error - Request error.
 * @returns Whether the request was stopped by a server-side time limit.
 */
export function isStatementTimeoutError(error: unknown): boolean {
    return getBricksErrorCode(error) === BRICKS_API_ERROR_CODES.statementTimeout;
}

/**
 * Extracts a human-readable message out of any error (FetchError, createError, Error).
 * Order: `data.message` (the ofetch response body) → `statusMessage` → `message` → fallback.
 *
 * @param error - Error object.
 * @param fallbackMessage - Default message when nothing is found in the error.
 * @returns Error message text.
 */
export function getBricksErrorMessage(error: unknown, fallbackMessage: string): string {
    const normalized = (error ?? {}) as IApiError;

    return (
        normalized.data?.message ||
        normalized.statusMessage ||
        normalized.message ||
        fallbackMessage
    );
}
