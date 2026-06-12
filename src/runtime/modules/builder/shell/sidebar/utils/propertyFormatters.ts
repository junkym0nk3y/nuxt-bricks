/**
 * Утилиты для форматирования значений свойств компонентов
 */

/**
 * Проверяет, является ли массив примитивным (содержит только строки, числа, boolean)
 *
 * @param value - Проверяемое значение
 * @returns true, если массив содержит только примитивные значения
 */
export function isPrimitiveArrayValue(value: unknown): value is Array<string | number | boolean> {
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
 * Форматирует примитивный массив в строку через запятую
 *
 * @param value - Массив примитивных значений
 * @returns Строка с элементами, разделенными запятыми
 */
export function formatPrimitiveArrayValue(value: unknown): string {
    if (!Array.isArray(value)) {
        return '';
    }

    return value.map((item) => String(item ?? '')).join(', ');
}

/**
 * Форматирует значение в JSON строку с отступами
 *
 * @param value - Значение для форматирования
 * @returns JSON строка или пустая строка в случае ошибки
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
 * Форматирует значение свойства для отображения в поле ввода
 *
 * @param value - Значение для форматирования
 * @returns Отформатированная строка
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
 * Парсит строку списка, разделенного запятыми
 *
 * @param value - Строка со значениями через запятую
 * @returns Массив очищенных строк
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
