/**
 * Общие примитивы server-first валидации DTO (/api/bricks/**): базовые
 * проверки типов/границ и отклонение неизвестных ключей. Используются
 * валидаторами страниц (payloadValidation.ts) и медиа (mediaPayloadValidation.ts).
 */
import { createError } from 'h3';

/** Лимит длины URL-полей (socialImage/thumbnailUrl/media.url). */
export const MAX_URL_LENGTH = 2048;

/** Допустимый формат внешних URL-полей DTO. */
export const HTTP_URL_PATTERN = /^https?:\/\//;

/** Правила валидации строкового поля. */
export interface IStringRule {
    min?: number;
    max: number;
    pattern?: RegExp;
    /** Пояснение формата для сообщения об ошибке (вместе с pattern). */
    patternHint?: string;
}

/**
 * Бросает 400 с сообщением о невалидном поле.
 *
 * @param message - Текст ошибки.
 */
export function invalid(message: string): never {
    throw createError({ statusCode: 400, statusMessage: message });
}

/**
 * Отклоняет тело с неизвестными ключами (400) — защита от дрейфа контракта
 * и от попыток протащить поля мимо валидации.
 *
 * @param body - Нормализованное тело запроса.
 * @param allowedKeys - Разрешённые camelCase-ключи DTO.
 */
export function assertKnownKeys(
    body: Record<string, unknown>,
    allowedKeys: ReadonlySet<string>
): void {
    const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));

    if (unknownKeys.length > 0) {
        invalid(`Unknown fields: ${unknownKeys.join(', ')}`);
    }
}

/**
 * Валидирует обязательную строку по правилам.
 *
 * @param value - Сырое значение поля.
 * @param field - Имя поля для сообщения об ошибке.
 * @param rule - Правила длины/формата.
 * @returns Строка после trim.
 */
export function requireString(value: unknown, field: string, rule: IStringRule): string {
    if (typeof value !== 'string') {
        invalid(`Field "${field}" must be a string`);
    }

    const trimmed = value.trim();

    if (rule.min !== undefined && trimmed.length < rule.min) {
        invalid(`Field "${field}" must be at least ${rule.min} characters`);
    }

    if (trimmed.length > rule.max) {
        invalid(`Field "${field}" must be at most ${rule.max} characters`);
    }

    if (rule.pattern && !rule.pattern.test(trimmed)) {
        invalid(
            `Field "${field}" has invalid format${rule.patternHint ? `: ${rule.patternHint}` : ''}`
        );
    }

    return trimmed;
}

/**
 * Валидирует опциональную nullable-строку: undefined — «поле не передано»,
 * null и пустая строка нормализуются в null, непустая проверяется по правилам.
 *
 * @param value - Сырое значение поля.
 * @param field - Имя поля для сообщения об ошибке.
 * @param rule - Правила длины/формата.
 * @returns Нормализованное значение.
 */
export function optionalNullableString(
    value: unknown,
    field: string,
    rule: IStringRule
): string | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    if (typeof value !== 'string') {
        invalid(`Field "${field}" must be a string or null`);
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : requireString(trimmed, field, rule);
}

/**
 * Валидирует опциональный boolean.
 *
 * @param value - Сырое значение поля.
 * @param field - Имя поля для сообщения об ошибке.
 * @returns Значение или undefined, если поле не передано.
 */
export function optionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'boolean') {
        invalid(`Field "${field}" must be a boolean`);
    }

    return value;
}
