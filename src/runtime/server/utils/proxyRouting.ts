/**
 * Маршрутизация dev-proxy middleware (чистые функции): решает, уходит ли запрос
 * на PROXY_URL, и строит target URL.
 *
 * Решение принимается по разобранному pathname (без query/hash — прежний
 * `startsWith` по полному URL пропускал bricks-пути с query на прокси)
 * и по границам сегментов (`/api/bricksmith` — не bricks-путь).
 *
 * `/api/bricks/**` (включая health-пробы) и `/mock-api/**` НИКОГДА не
 * проксируются: с введением bricks.backend.mode persistence не выбирается
 * PROXY_URL — все bricks-ручки локальные (docs/backend-connection-modes-plan).
 */

import { joinURL } from 'ufo';

// #region Constants
const API_PREFIX = '/api';
const LOCAL_API_PREFIX = '/api/bricks';
const MOCK_API_PREFIX = '/mock-api';
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
 * Извлекает pathname + query из URL входящего запроса (для построения
 * target URL прокси — query обязан доехать до upstream).
 *
 * @param url - `req.url` входящего запроса.
 * @returns `pathname?query` или пустая строка, если URL отсутствует/невалиден.
 */
export function resolveRequestPathWithQuery(url: string | undefined): string {
    if (!url) {
        return '';
    }

    try {
        const parsed = new URL(url, 'http://internal');
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return '';
    }
}

/**
 * Решает, должен ли запрос проксироваться на внешний backend (PROXY_URL):
 * `/api/bricks/**` и `/mock-api/**` — никогда (локальные Nitro-ручки),
 * остальные `/api/**` — да.
 *
 * @param pathname - Разобранный pathname запроса (см. resolveRequestPathname).
 * @returns true, если запрос уходит на прокси.
 */
export function shouldProxyRequest(pathname: string): boolean {
    if (!pathname) {
        return false;
    }

    // Mock API и bricks API — НИКОГДА не проксируем (локальные Nitro-роуты)
    if (matchesPrefix(pathname, MOCK_API_PREFIX) || matchesPrefix(pathname, LOCAL_API_PREFIX)) {
        return false;
    }

    return matchesPrefix(pathname, API_PREFIX);
}

/**
 * Строит target URL прокси из base (PROXY_URL) и пути запроса. joinURL
 * нормализует слэши на стыке: прежняя голая конкатенация h3-proxy давала
 * `http://host:portapi/...` → 502 для PROXY_URL без завершающего слэша.
 *
 * @param baseUrl - PROXY_URL (с завершающим слэшем или без, может содержать base path).
 * @param pathnameWithQuery - Путь запроса с query (см. resolveRequestPathWithQuery).
 * @returns Абсолютный URL upstream-запроса.
 */
export function buildProxyTargetUrl(baseUrl: string, pathnameWithQuery: string): string {
    return joinURL(baseUrl, pathnameWithQuery);
}
