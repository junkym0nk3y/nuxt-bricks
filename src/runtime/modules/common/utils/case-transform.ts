/**
 * Утилиты для конвертации snake_case ↔ camelCase.
 * Используется для нормализации ответов от Django backend.
 */

/**
 * Конвертирует строку из snake_case в camelCase.
 *
 * @param str - Строка в snake_case.
 * @returns Строка в camelCase.
 */
export function toCamelCaseString(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Конвертирует ключи объекта из snake_case в camelCase (рекурсивно).
 *
 * @param obj - Объект с ключами в snake_case.
 * @returns Новый объект с ключами в camelCase.
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
 * Конвертирует только top-level ключи объекта из snake_case в camelCase.
 * Значения (включая вложенные объекты, например `schema`) остаются без изменений.
 *
 * @param obj - Объект с ключами в snake_case.
 * @returns Новый объект с top-level ключами в camelCase.
 */
export function toCamelCaseShallow<T>(obj: object): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        result[toCamelCaseString(key)] = value;
    }

    return result as T;
}

/**
 * Конвертирует строку из camelCase в snake_case.
 *
 * @param str - Строка в camelCase.
 * @returns Строка в snake_case.
 */
export function toSnakeCaseString(str: string): string {
    return str
        .replace(/([A-Z])/g, '_$1')
        .replace(/_{2,}/g, '_')
        .toLowerCase();
}

/**
 * Конвертирует только top-level ключи объекта из camelCase в snake_case.
 * Значения (включая вложенные объекты) остаются без изменений.
 *
 * @param obj - Объект с ключами в camelCase.
 * @returns Новый объект с top-level ключами в snake_case.
 */
export function toSnakeCaseShallow(obj: object): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        result[toSnakeCaseString(key)] = value;
    }

    return result;
}

/**
 * Конвертирует ключи объекта из camelCase в snake_case (рекурсивно).
 *
 * @param obj - Объект с ключами в camelCase.
 * @returns Новый объект с ключами в snake_case.
 */
export function toSnakeCase<T>(obj: unknown): T {
    if (obj === null || obj === undefined) {
        return obj as T;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => toSnakeCase(item)) as T;
    }

    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
            const snakeKey = toSnakeCaseString(key);
            result[snakeKey] = toSnakeCase(value);
        }

        return result as T;
    }

    return obj as T;
}
