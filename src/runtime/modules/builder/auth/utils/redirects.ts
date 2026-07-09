/**
 * Санитизация возвратного redirect-пути после логина.
 */

/** Дефолтный путь после логина. */
const DEFAULT_REDIRECT = '/bricks';

/**
 * Возвращает безопасный внутренний путь из query-параметра redirect.
 * Допускаются только внутренние пути с одним ведущим `/`: `//host`, `/\`,
 * абсолютные URL и не-строки отбрасываются — защита от open redirect.
 *
 * @param raw - Значение query-параметра redirect.
 * @returns Внутренний путь или /bricks.
 */
export function sanitizeRedirectPath(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length === 0) {
        return DEFAULT_REDIRECT;
    }

    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
        return DEFAULT_REDIRECT;
    }

    return raw;
}
