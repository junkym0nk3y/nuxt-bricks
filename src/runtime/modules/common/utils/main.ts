import type { IApiError, TRequestErrorLike } from '../types/bricks-api';
import { BRICKS_API_ERROR_CODES } from '../constants/apiErrors';

/** Строковые значения флага, считающиеся включением (env-переменные — строки). */
const TRUTHY_FLAG_VALUES = new Set(['true', '1', 'yes', 'on']);

/**
 * Приводит значение runtimeConfig/env к булеву флагу (boolean из опций
 * модуля или строка из env-override).
 *
 * @param value - Сырое значение флага.
 */
export function parseBricksBooleanFlag(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        return TRUTHY_FLAG_VALUES.has(value.trim().toLowerCase());
    }

    return false;
}

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
 * Распознаёт отказ, при котором база остановила запрос своим лимитом времени:
 * ручка отдаёт машиночитаемый код в `data.code`, h3 сериализует его в тело
 * ответа, а ofetch кладёт тело в `error.data` — код оказывается на два уровня
 * вглубь. Fallback на `data.code` покрывает форму без вложенности.
 *
 * Нужен обоим доменам билдера: без разбора кода отказ доехал бы до пользователя
 * англоязычным транспортным текстом (`[PUT] "/api/…": 504 …`), а по классу
 * ошибки он неотличим от прочих 5xx.
 *
 * @param error - Ошибка запроса.
 * @returns Запрос остановлен серверным лимитом времени.
 */
export function isStatementTimeoutError(error: unknown): boolean {
    const payload = (error ?? {}) as TRequestErrorLike;
    const nested = (payload.data as { data?: { code?: unknown } } | undefined)?.data?.code;
    const code = nested ?? payload.data?.code;

    return code === BRICKS_API_ERROR_CODES.statementTimeout;
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
