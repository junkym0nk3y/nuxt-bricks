// #region Imports
// Types
import type { IPropertyDefinition } from '../../../../common/types/brick';

// Utils
import { isPrimitiveArrayValue, parseListInput } from './propertyFormatters';
// #endregion

/**
 * Определяет источник с примитивными значениями (текущее или значение по умолчанию),
 * если они подходят для строкового парсинга.
 *
 * @param currentArray - Значение из компонентов.
 * @param defaultArray - Значение по умолчанию из конфигурации.
 * @returns Массив примитивов или null, если источника нет.
 */
function resolvePrimitiveSource(
    currentArray?: unknown[],
    defaultArray?: unknown[]
): Array<string | number | boolean> | null {
    if (currentArray && isPrimitiveArrayValue(currentArray)) {
        return currentArray;
    }
    if (defaultArray && isPrimitiveArrayValue(defaultArray)) {
        return defaultArray;
    }
    return null;
}

/**
 * Преобразует строковое значение в массив примитивов, учитывая тип примера.
 *
 * @param rawValue - Строковое значение из ввода.
 * @param primitiveSource - Примитивный пример для определения типа.
 * @returns Массив значений соответствующего типа.
 */
function parsePrimitiveArrayValue(
    rawValue: string,
    primitiveSource: Array<string | number | boolean> | null
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
 * Пытается распарсить сложный массив через JSON.
 *
 * @param rawValue - Строковое значение (ожидается JSON).
 * @returns Массив либо null в случае ошибки.
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
 * Округляет число для устранения ошибок IEEE 754 floating point.
 * Например, 5.400000000000001 → 5.4
 *
 * @param value - Числовое значение.
 * @returns Округлённое до 4 знаков после запятой число.
 */
function roundFloatingPoint(value: number): number {
    return Math.round(value * 10000) / 10000;
}

/**
 * Преобразует значение в число с учетом текущего значения
 *
 * @param value - Входное значение (строка, число или boolean)
 * @param currentValue - Текущее значение свойства
 * @returns Преобразованное число или null в случае ошибки
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
 * Преобразует значение в массив с учетом типа элементов
 *
 * @param property - Определение свойства
 * @param value - Входное значение
 * @param currentValue - Текущее значение свойства
 * @returns Преобразованный массив или null в случае ошибки
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
 * Преобразует значение в объект через JSON парсинг
 *
 * @param property - Определение свойства
 * @param value - Входное значение
 * @param currentValue - Текущее значение свойства
 * @returns Преобразованный объект/массив или null в случае ошибки
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
