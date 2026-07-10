/**
 * Санитизация возвратного redirect-пути после логина.
 */

/**
 * Возвращает безопасный внутренний путь из query-параметра redirect.
 * Допускаются только внутренние пути с одним ведущим `/`: `//host`, `/\`,
 * абсолютные URL и не-строки отбрасываются — защита от open redirect.
 *
 * @param raw - Значение query-параметра redirect.
 * @param fallbackPath - Путь по умолчанию (дашборд билдера из `bricks.routes`).
 * @returns Внутренний путь или fallbackPath.
 */
export function sanitizeRedirectPath(raw: unknown, fallbackPath: string): string {
    if (typeof raw !== 'string' || raw.length === 0) {
        return fallbackPath;
    }

    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
        return fallbackPath;
    }

    return raw;
}
