/**
 * Маршрутизация proxy-middleware (чистые функции): решает, уходит ли запрос
 * на PROXY_URL или обслуживается локальными Nitro-ручками.
 *
 * Решение принимается по разобранному pathname (без query/hash — прежний
 * `startsWith` по полному URL пропускал health-пути с query на прокси)
 * и по границам сегментов (`/api/bricksmith` — не bricks-путь).
 */

// #region Constants
const API_PREFIX = '/api';
const LOCAL_API_PREFIX = '/api/bricks';
const MOCK_API_PREFIX = '/mock-api';

/**
 * Health-пробы модуля (см. BRICKS_API_HANDLERS): обслуживаются локально всегда,
 * даже без локальной БД в proxy-режиме — иначе liveness/readiness самого
 * приложения подменялись бы ответом backend'а. Только точные пути
 * (`/api/bricks/healthcheck` и т.п. — обычные проксируемые пути).
 */
const LOCAL_HEALTH_PATHS = new Set(['/api/bricks/health', '/api/bricks/health/ready']);

/** Методы health-проб; остальные методы этих путей идут по общим правилам. */
const HEALTH_METHODS = new Set(['GET', 'HEAD']);
// #endregion

/**
 * Проверяет, что pathname лежит внутри префикса по границе сегмента:
 * `/api/bricks/x` и `/api/bricks` — да, `/api/bricksmith` — нет.
 *
 * @param pathname - Разобранный pathname запроса.
 * @param prefix - Префикс без trailing slash.
 * @returns true, если pathname — сам префикс или путь под ним.
 */
function matchesPrefix(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Извлекает pathname из URL входящего запроса (origin-form или absolute-form),
 * отбрасывая query и hash.
 *
 * @param url - `req.url` входящего запроса.
 * @returns Pathname запроса или пустая строка, если URL отсутствует/невалиден.
 */
export function resolveRequestPathname(url: string | undefined): string {
    if (!url) {
        return '';
    }

    try {
        return new URL(url, 'http://internal').pathname;
    } catch {
        return '';
    }
}

/**
 * Решает, должен ли запрос проксироваться на внешний backend (PROXY_URL):
 * mock-api и health-пробы модуля — никогда; `/api/bricks/**` — нет при
 * сконфигурированной локальной БД; остальные `/api/**` — да.
 *
 * @param pathname - Разобранный pathname запроса (см. resolveRequestPathname).
 * @param options - Метод запроса и признак сконфигурированной локальной БД.
 * @returns true, если запрос уходит на прокси.
 */
export function shouldProxyRequest(
    pathname: string,
    options: { method: string; hasLocalDatabase: boolean }
): boolean {
    if (!pathname) {
        return false;
    }

    // Mock API — НИКОГДА не проксируем (локальные Nitro-роуты)
    if (matchesPrefix(pathname, MOCK_API_PREFIX)) {
        return false;
    }

    // Health-пробы модуля — всегда локальные (GET/HEAD), независимо от БД
    if (LOCAL_HEALTH_PATHS.has(pathname) && HEALTH_METHODS.has(options.method.toUpperCase())) {
        return false;
    }

    // При сконфигурированной БД /api/bricks/** обслуживают локальные ручки
    if (matchesPrefix(pathname, LOCAL_API_PREFIX) && options.hasLocalDatabase) {
        return false;
    }

    return matchesPrefix(pathname, API_PREFIX);
}
