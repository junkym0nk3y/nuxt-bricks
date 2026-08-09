/**
 * Общие помощники HTTP-адаптера external backend: нормализация формы ответа и
 * распознавание контрактных статусов.
 *
 * Выделены из `httpStorageAdapter.ts`, когда медиа-часть уехала в свой файл:
 * обеим половинам нужны те же примитивы, а вторая копия предикатов 404/409
 * разошлась бы с первой при следующей правке контракта.
 */
import { BricksBackendRequestError } from './httpClient';
import { toCamelCaseShallow } from '../../../common/utils/case-transform';
import { BRICKS_API_ERROR_CODES } from '../../../common/constants/apiErrors';

/**
 * Нормализует строку-ответ external backend: top-level ключи snake_case →
 * camelCase, вложенные значения (включая `schema`) — без изменений.
 *
 * @param raw - Распарсенное тело ответа.
 * @param context - Описание запроса для сообщения об ошибке формата.
 * @returns Нормализованная строка.
 */
export function normalizeRow<T>(raw: unknown, context: string): T {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`[Bricks Backend] ${context}: expected an object row in response`);
    }

    return toCamelCaseShallow<T>(raw);
}

/**
 * Нормализует массив строк-ответов external backend.
 *
 * @param raw - Распарсенное тело ответа.
 * @param context - Описание запроса для сообщения об ошибке формата.
 * @returns Массив нормализованных строк.
 */
export function normalizeRows<T>(raw: unknown, context: string): T[] {
    if (!Array.isArray(raw)) {
        throw new Error(`[Bricks Backend] ${context}: expected an array in response`);
    }

    return raw.map((item) => normalizeRow<T>(item, context));
}

/**
 * Достаёт список из ответа: плоский массив либо envelope `{ items: [...] }`
 * (формат локальных ручек GET /api/bricks/media и /media/categories).
 *
 * @param raw - Распарсенное тело ответа.
 * @param context - Описание запроса для сообщения об ошибке формата.
 * @returns Массив сырых записей.
 */
export function unwrapItemsList(raw: unknown, context: string): unknown[] {
    if (Array.isArray(raw)) {
        return raw;
    }

    if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
        return (raw as { items: unknown[] }).items;
    }

    throw new Error(`[Bricks Backend] ${context}: expected an array or { items: [...] } envelope`);
}

/**
 * Проверяет, что ошибка — HTTP 404 external backend (контрактный «не найдено»).
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true для 404.
 */
export function isNotFoundError(error: unknown): boolean {
    return error instanceof BricksBackendRequestError && error.upstreamStatus === 404;
}

/**
 * Проверяет, что ошибка — HTTP 409 external backend (конфликт записи).
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true для 409.
 */
export function isConflictError(error: unknown): error is BricksBackendRequestError {
    return error instanceof BricksBackendRequestError && error.upstreamStatus === 409;
}

/**
 * Проверяет, что ошибка — контрактный отказ external backend «категории нет»:
 * 400 С машиночитаемым кодом.
 *
 * Одного статуса мало: 400 без кода — это произвольная валидация чужого
 * backend'а, и выдавать её за отсутствующую категорию значило бы врать
 * пользователю. Ровно поэтому же исход такого отказа считается определённым
 * только при совпадении кода — контракт обязывает backend не коммитить запись,
 * которой он ответил этим кодом.
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true для 400 UNKNOWN_MEDIA_CATEGORY.
 */
export function isUnknownMediaCategoryError(error: unknown): boolean {
    return (
        error instanceof BricksBackendRequestError &&
        error.upstreamStatus === 400 &&
        error.errorCode === BRICKS_API_ERROR_CODES.unknownMediaCategory
    );
}
