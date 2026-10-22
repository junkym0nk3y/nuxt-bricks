/**
 * Utilities for converting snake_case ↔ camelCase.
 * Used to normalize database rows and the responses of an external backend, whose
 * keys arrive in snake_case.
 */

/**
 * Converts a string from snake_case into camelCase.
 *
 * @param str - String in snake_case.
 * @returns String in camelCase.
 */
function toCamelCaseString(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Converts the keys of an object from snake_case into camelCase (recursively).
 *
 * @param obj - Object with keys in snake_case.
 * @returns A new object with keys in camelCase.
 */
export function toCamelCase<T>(obj: unknown): T {
    if (obj === null || obj === undefined) {
        return obj as T;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => toCamelCase(item)) as T;
    }

    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
            const camelKey = toCamelCaseString(key);
            result[camelKey] = toCamelCase(value);
        }

        return result as T;
    }

    return obj as T;
}

/**
 * Converts only the top-level keys of an object from snake_case into camelCase.
 * The values (nested objects such as `schema` included) are left untouched.
 *
 * @param obj - Object with keys in snake_case.
 * @returns A new object with top-level keys in camelCase.
 */
export function toCamelCaseShallow<T>(obj: object): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        result[toCamelCaseString(key)] = value;
    }

    return result as T;
}

/**
 * Converts a string from camelCase into snake_case.
 *
 * @param str - String in camelCase.
 * @returns String in snake_case.
 */
export function toSnakeCaseString(str: string): string {
    return str
        .replace(/([A-Z])/g, '_$1')
        .replace(/_{2,}/g, '_')
        .toLowerCase();
}

/**
 * Converts only the top-level keys of an object from camelCase into snake_case.
 * The values (nested objects included) are left untouched.
 *
 * @param obj - Object with keys in camelCase.
 * @returns A new object with top-level keys in snake_case.
 */
export function toSnakeCaseShallow(obj: object): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        result[toSnakeCaseString(key)] = value;
    }

    return result;
}
