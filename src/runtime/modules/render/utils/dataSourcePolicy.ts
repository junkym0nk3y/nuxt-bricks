/**
 * Политика выполнения data sources published-страницы (чистые функции).
 *
 * Data sources объявляются в brick-файлах и выполняются рендерером на каждый
 * SSR/refresh публичной страницы, поэтому клиент к ним — отдельный и ограниченный
 * (см. useDataSourceClient): без cookies и identity, только безопасные методы,
 * абсолютные URL — по allow-list хостов из `bricks.dataSources.allowedHosts`.
 */

// #region Constants
/** Дефолтный таймаут одного запроса data source, мс. */
export const DEFAULT_DATA_SOURCE_TIMEOUT_MS = 10000;

/** Дефолтный лимит одновременных запросов data sources на страницу. */
export const DEFAULT_DATA_SOURCE_CONCURRENCY = 6;

/** Дефолтный лимит размера одного ответа data source, байт (~UTF-16 code units JSON). */
export const DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES = 1024 * 1024;

/** Дефолтный максимум запросов data sources на один прогон страницы. */
export const DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE = 24;

/** Дефолтный суммарный wall-clock budget всех data sources одного прогона, мс. */
export const DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS = 15000;

/** Разрешённые HTTP-методы data source (safe/idempotent — выполняются на рендер). */
const ALLOWED_DATA_SOURCE_METHODS = new Set(['GET', 'HEAD']);
// #endregion

// #region Types
export type TDataSourceUrlCheck = { allowed: true } | { allowed: false; reason: string };

export type TResolvedDataSourceMethod = 'GET' | 'HEAD';
// #endregion

/**
 * Нормализует HTTP-метод data source и проверяет его по allow-list.
 *
 * @param method - Метод из объявления data source (любой регистр, опционален).
 * @returns Нормализованный метод (верхний регистр) или null, если метод запрещён.
 */
export function resolveDataSourceMethod(method?: string): TResolvedDataSourceMethod | null {
    const normalized = (method || 'GET').toUpperCase();
    return ALLOWED_DATA_SOURCE_METHODS.has(normalized)
        ? (normalized as TResolvedDataSourceMethod)
        : null;
}

/**
 * Проверяет URL data source по политике: относительные URL разрешены всегда,
 * абсолютные — только http(s) на хост из allow-list.
 *
 * @param url - Резолвленный URL запроса (после подстановки параметров).
 * @param allowedHosts - Разрешённые хосты абсолютных URL (без порта/протокола).
 * @returns Результат проверки; при отказе — машиночитаемая причина для лога.
 */
export function checkDataSourceUrl(url: string, allowedHosts: string[]): TDataSourceUrlCheck {
    if (!url) {
        return { allowed: false, reason: 'empty url' };
    }

    // Относительный путь внутри приложения (protocol-relative `//host` — не он)
    if (url.startsWith('/') && !url.startsWith('//')) {
        return { allowed: true };
    }

    let parsed: URL;

    try {
        parsed = new URL(url);
    } catch {
        return { allowed: false, reason: 'url is neither relative nor absolute http(s)' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { allowed: false, reason: `protocol "${parsed.protocol}" is not allowed` };
    }

    const hostname = parsed.hostname.toLowerCase();
    const isAllowedHost = allowedHosts.some((host) => host.toLowerCase() === hostname);

    if (!isAllowedHost) {
        return {
            allowed: false,
            reason: `host "${hostname}" is not in bricks.dataSources.allowedHosts`,
        };
    }

    return { allowed: true };
}

/**
 * Приблизительный размер ответа в байтах — длина JSON-сериализации
 * (UTF-16 code units; точность достаточна для бюджета). Несериализуемое
 * значение (циклы, BigInt) — Infinity: такой ответ бюджет не проходит.
 *
 * @param value - Ответ data source.
 */
export function measureResponseSizeBytes(value: unknown): number {
    if (value === undefined || value === null) {
        return 0;
    }

    try {
        return JSON.stringify(value)?.length ?? 0;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}
