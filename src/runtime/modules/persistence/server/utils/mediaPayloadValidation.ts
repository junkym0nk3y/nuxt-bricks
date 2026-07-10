/**
 * Server-first валидация DTO ручек медиа (/api/bricks/media/**).
 *
 * Каждый валидатор отклоняет неизвестные ключи (400), проверяет типы/границы
 * и возвращает НОВЫЙ объект только из известных нормализованных полей.
 * Общие примитивы — payloadPrimitives.ts, валидаторы страниц — payloadValidation.ts.
 */
import type { ICreateMediaPayload, TUpdateMediaPayload } from '../../types/adapters';
import {
    HTTP_URL_PATTERN,
    MAX_URL_LENGTH,
    assertKnownKeys,
    invalid,
    optionalNullableString,
    requireString,
} from './payloadPrimitives';

// #region Constants
/** Лимит inline SVG-контента медиа. */
const MAX_SVG_CONTENT_CHARS = 1024 * 1024;

const FILENAME_MAX_LENGTH = 255;
const ALT_MAX_LENGTH = 512;
const CATEGORY_MAX_LENGTH = 100;
const MIME_TYPE_MAX_LENGTH = 127;
const UPLOADED_AT_MAX_LENGTH = 40;

const MIME_TYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

const CREATE_MEDIA_KEYS = new Set([
    'url',
    'filename',
    'size',
    'mimeType',
    'category',
    'svgContent',
    'alt',
    'uploadedAt',
]);

const UPDATE_MEDIA_KEYS = new Set(['filename', 'alt', 'category']);
// #endregion

/**
 * Валидирует payload POST /api/bricks/media (метаданные загруженного файла).
 *
 * @param body - Нормализованное тело запроса.
 * @returns Чистый payload создания медиа.
 */
export function validateCreateMediaPayload(body: Record<string, unknown>): ICreateMediaPayload {
    assertKnownKeys(body, CREATE_MEDIA_KEYS);

    const result: ICreateMediaPayload = {
        url: requireString(body.url, 'url', {
            min: 1,
            max: MAX_URL_LENGTH,
            pattern: HTTP_URL_PATTERN,
            patternHint: 'must be an http(s) URL',
        }),
        filename: requireString(body.filename, 'filename', { min: 1, max: FILENAME_MAX_LENGTH }),
        size: validateMediaSize(body.size),
        mimeType: requireString(body.mimeType, 'mimeType', {
            min: 3,
            max: MIME_TYPE_MAX_LENGTH,
            pattern: MIME_TYPE_PATTERN,
        }),
        category: validateMediaCategory(body.category),
    };

    const svgContent = optionalNullableString(body.svgContent, 'svgContent', {
        max: MAX_SVG_CONTENT_CHARS,
    });
    if (svgContent !== undefined) {
        result.svgContent = svgContent;
    }

    if (body.alt !== undefined) {
        result.alt = requireString(body.alt, 'alt', { max: ALT_MAX_LENGTH });
    }

    if (body.uploadedAt !== undefined) {
        const uploadedAt = requireString(body.uploadedAt, 'uploadedAt', {
            min: 1,
            max: UPLOADED_AT_MAX_LENGTH,
        });

        if (Number.isNaN(Date.parse(uploadedAt))) {
            invalid('Field "uploadedAt" must be a valid date string');
        }

        result.uploadedAt = uploadedAt;
    }

    return result;
}

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

/**
 * Валидирует размер медиа-файла: неотрицательный safe integer.
 *
 * @param value - Сырое значение поля size.
 * @returns Размер в байтах.
 */
function validateMediaSize(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        invalid('Field "size" must be a non-negative integer');
    }

    return value;
}
