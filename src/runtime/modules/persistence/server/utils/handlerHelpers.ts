/**
 * Общие помощники для Nitro-ручек /api/bricks/** (parse → adapter → return).
 */
import { createError, getRouterParam, readBody, type H3Event } from 'h3';
import { toCamelCaseShallow } from '../../../common/utils/case-transform';

/**
 * Достаёт числовой id из параметров роута; 400 — если отсутствует или не число.
 *
 * @param event - Событие запроса.
 * @returns Числовой id записи.
 */
export function requireNumericId(event: H3Event): number {
    const rawId = getRouterParam(event, 'id');
    const id = rawId ? Number.parseInt(rawId, 10) : Number.NaN;

    if (!rawId || Number.isNaN(id)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Id must be a valid integer',
        });
    }

    return id;
}

/**
 * Читает тело запроса и нормализует top-level ключи snake_case → camelCase.
 * Вложенные объекты (включая `schema`) не трогаются.
 *
 * @param event - Событие запроса.
 * @returns Нормализованное тело запроса.
 */
export async function readNormalizedBody<T>(event: H3Event): Promise<T> {
    const body = await readBody<object | null>(event);

    if (!body || typeof body !== 'object') {
        throw createError({
            statusCode: 400,
            statusMessage: 'Request body is required',
        });
    }

    return toCamelCaseShallow<T>(body);
}

/**
 * Перебрасывает h3-ошибки как есть, остальное логирует и заворачивает в 500.
 *
 * @param error - Пойманная ошибка.
 * @param fallbackMessage - Сообщение для 500-ответа.
 */
export function toHttpError(error: unknown, fallbackMessage: string): never {
    if (error && typeof error === 'object' && 'statusCode' in error) {
        throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Bricks API] ${fallbackMessage}:`, error);

    throw createError({
        statusCode: 500,
        statusMessage: `${fallbackMessage}: ${message}`,
    });
}
