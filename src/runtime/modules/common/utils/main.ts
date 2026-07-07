import type { IApiError } from '../types/bricks-api';

/**
 * Конвертирует значения в пикселях в rem-единицы, используя базовое значение.
 *
 * @param valueInPixels - Размер в пикселях.
 * @param remBasePx - Базовое значение rem в пикселях (по умолчанию 10).
 * @returns Размер в rem-единицах.
 */
export function convertPxToRem(valueInPixels: number, remBasePx: number = 10): string {
    return `${valueInPixels / remBasePx}rem`;
}

/**
 * Конвертирует значения в rem обратно в пиксели, используя базовое значение.
 *
 * @param valueInRem - Размер в rem, может включать суффикс 'rem'.
 * @param remBasePx - Базовое значение rem в пикселях (по умолчанию 10).
 * @returns Размер в пикселях.
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
 * Создает debounced версию функции с методом отмены.
 *
 * @param func - Функция для debounce.
 * @param delay - Задержка в миллисекундах.
 * @returns Debounced функция с методом cancel.
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): T & { cancel: () => void } {
    let timeoutId: NodeJS.Timeout | null = null;

    const debounced = function (this: any, ...args: Parameters<T>) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func.apply(this, args);
            timeoutId = null;
        }, delay);
    } as T & { cancel: () => void };

    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

/**
 * Валидирует шестнадцатеричное значение цвета.
 *
 * @param hex - Значение цвета для проверки (с # или без).
 * @returns True если корректный hex-цвет, false в противном случае.
 */
export function validateHex(hex: string): boolean {
    if (!hex) {
        return false;
    }

    const stripped = hex.replace(/^#/, '');

    // Допустимые длины: 3 (RGB) или 6 (RRGGBB)
    if (stripped.length !== 3 && stripped.length !== 6) {
        return false;
    }

    // Проверяем, что все символы являются валидными hex-цифрами
    return /^[0-9A-Fa-f]+$/.test(stripped);
}

/**
 * Нормализует шестнадцатеричное значение цвета, всегда добавляя префикс #.
 *
 * @param hex - Значение цвета для нормализации.
 * @returns Нормализованный hex-цвет с префиксом #.
 */
export function normalizeHex(hex: string): string {
    if (!hex) {
        return '#000000';
    }

    let stripped = hex.replace(/^#/, '').toUpperCase();

    // Если это 3-символьный hex, разворачиваем до 6
    if (stripped.length === 3) {
        stripped = stripped
            .split('')
            .map((char) => char + char)
            .join('');
    }

    // Гарантируем 6 символов, дополняя нулями при необходимости
    while (stripped.length < 6) {
        stripped = '0' + stripped;
    }

    return `#${stripped}`;
}

/**
 * Нормализует любую ошибку в структуру, подходящую для createError.
 * Используется для консистентного форматирования статуса и сообщения без утечки внутренних деталей.
 *
 * @param error - Объект ошибки для нормализации.
 * @param fallbackMessage - Сообщение по умолчанию, если в ошибке не найдено конкретное сообщение.
 * @param fallbackStatus - Код статуса по умолчанию, если в ошибке не найден конкретный статус.
 * @returns Объект с statusCode и statusMessage.
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
 * Извлекает человекочитаемое сообщение из любой ошибки (FetchError, createError, Error).
 * Порядок: `data.message` (тело ответа ofetch) → `statusMessage` → `message` → fallback.
 *
 * @param error - Объект ошибки.
 * @param fallbackMessage - Сообщение по умолчанию, если в ошибке ничего не найдено.
 * @returns Текст сообщения об ошибке.
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
