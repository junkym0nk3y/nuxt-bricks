import type { TRequestErrorLike } from '../../../common/types/bricks-api';

/**
 * Форматирует ошибку запроса в человекочитаемое сообщение.
 *
 * @param method - HTTP-метод.
 * @param url - URL запроса.
 * @param error - Исходная ошибка.
 */
export function formatRequestError(method: string, url: string, error: unknown): string {
    const payload = (error ?? {}) as TRequestErrorLike;
    const message =
        payload.data?.message ||
        payload.message ||
        (error instanceof Error ? error.message : 'Неизвестная ошибка');
    const code = payload.data?.code || payload.code || payload.statusCode;
    const codePart = code ? ` (code: ${String(code)})` : '';

    return `${method} ${url}: ${message}${codePart}`;
}

/**
 * Приводит произвольную ошибку к Error с понятным текстом.
 *
 * @param method - HTTP-метод.
 * @param url - URL запроса.
 * @param error - Исходная ошибка.
 */
export function toRequestError(method: string, url: string, error: unknown): Error {
    if (error instanceof Error && error.message.includes('/api/')) {
        return error;
    }

    return new Error(formatRequestError(method, url, error));
}
