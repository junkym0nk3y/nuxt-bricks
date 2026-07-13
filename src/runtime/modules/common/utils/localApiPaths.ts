/**
 * Чистые предикаты локальных API-путей — единственная копия правила
 * «`/api/bricks/**` всегда обслуживается локальными Nitro-ручками» для
 * клиента (useApiClient) и сервера (devProxy routing).
 * С введением bricks.backend.mode persistence не выбирается PROXY_URL,
 * поэтому решение не зависит от наличия БД
 * (docs/backend-connection-modes-plan-2026-07-12.md).
 */

// #region Constants
/** Префиксы локальных ручек: persistence, health, auth, библиотека
 * компонентов, media proxy, page thumbnail. */
const LOCAL_API_PREFIXES = ['/api/bricks'];
// #endregion

/**
 * Проверяет, что pathname лежит внутри префикса по границе сегмента:
 * `/api/bricks/x` и `/api/bricks` — да, `/api/bricksmith` — нет.
 *
 * @param pathname - Разобранный pathname запроса (без query/hash).
 * @param prefix - Префикс без trailing slash.
 * @returns true, если pathname — сам префикс или путь под ним.
 */
export function matchesPathPrefix(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Решает, является ли pathname локальным API-путём модуля (`/api/bricks/**`).
 *
 * @param pathname - Разобранный pathname запроса (без query/hash).
 * @returns true для локальных bricks-путей.
 */
export function isLocalApiPathname(pathname: string): boolean {
    return LOCAL_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

/**
 * Решает по строке запроса $fetch, локальный ли это API-путь: origin-form
 * (`/api/bricks/pages?x=1`) разбирается до pathname (query/hash не влияют
 * на решение), абсолютные URL и пути без ведущего слэша локальными не
 * считаются (для них baseURL-переключение не применяется).
 *
 * @param request - Строка запроса $fetch (путь, возможно с query/hash).
 * @returns true, если запрос должен уйти на локальный Nuxt-сервер.
 */
export function isLocalApiRequest(request: string): boolean {
    if (!request.startsWith('/')) {
        return false;
    }

    try {
        return isLocalApiPathname(new URL(request, 'http://internal').pathname);
    } catch {
        return false;
    }
}
