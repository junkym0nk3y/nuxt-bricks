/**
 * Server-first валидация DTO ручек медиа (/api/bricks/media/**).
 *
 * Каждый валидатор отклоняет неизвестные ключи (400), проверяет типы/границы
 * и возвращает НОВЫЙ объект только из известных нормализованных полей.
 * Общие примитивы — payloadPrimitives.ts, валидаторы страниц — payloadValidation.ts.
 */
import type { TUpdateMediaPayload } from '../../types/adapters';
import { assertKnownKeys, invalid, requireString } from './payloadPrimitives';

// #region Constants
const FILENAME_MAX_LENGTH = 255;
const ALT_MAX_LENGTH = 512;
const CATEGORY_MAX_LENGTH = 100;

const UPDATE_MEDIA_KEYS = new Set(['filename', 'alt', 'category']);
// #endregion

/**
 * Валидирует payload PATCH /api/bricks/media/:id.
 * Все поля опциональны; требует хотя бы одно.
 *
 * @param body - Нормализованное тело запроса.
 * @returns Чистый payload обновления медиа.
 */
export function validateUpdateMediaPayload(body: Record<string, unknown>): TUpdateMediaPayload {
    assertKnownKeys(body, UPDATE_MEDIA_KEYS);

    const result: TUpdateMediaPayload = {};

    if (body.filename !== undefined) {
        result.filename = requireString(body.filename, 'filename', {
            min: 1,
            max: FILENAME_MAX_LENGTH,
        });
    }

    if (body.alt !== undefined) {
        result.alt = requireString(body.alt, 'alt', { max: ALT_MAX_LENGTH });
    }

    if (body.category !== undefined) {
        result.category = validateMediaCategory(body.category);
    }

    if (Object.values(result).every((value) => value === undefined)) {
        invalid('No fields to update');
    }

    return result;
}

/**
 * Валидирует категорию медиа (используется и multipart-ручкой загрузки).
 *
 * @param value - Сырое значение поля category.
 * @returns Категория после trim.
 */
export function validateMediaCategory(value: unknown): string {
    return requireString(value, 'category', { min: 1, max: CATEGORY_MAX_LENGTH });
}
