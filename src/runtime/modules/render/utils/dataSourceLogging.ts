/**
 * Redaction лог-payload'ов data sources для production (чистые функции).
 *
 * Резолвленный URL data source содержит подставленные параметры (значения из
 * props компонентов и настроек страницы), а сырая ошибка ofetch — request,
 * response и options целиком. В production ни то, ни другое в логи не попадает:
 * URL сворачивается до цели (`local` / origin), ошибка — до allow-list полей.
 * Подробные payload'ы остаются в dev-ветках (`import.meta.dev`) composable.
 */

// #region Types
/** Allow-list полей ошибки data source для production-лога. */
export interface IDataSourceLogError {
    name: string;
    statusCode?: number;
}
// #endregion

/**
 * Сворачивает резолвленный URL data source до безопасной цели для лога:
 * относительный путь → `'local'`, абсолютный http(s) → только origin,
 * всё остальное (protocol-relative, мусор) → `'invalid-url'`.
 *
 * @param url - Резолвленный URL запроса (после подстановки параметров).
 * @returns Цель запроса без path/query/параметров.
 */
export function resolveDataSourceLogTarget(url: string): string {
    if (!url) {
        return 'invalid-url';
    }

    if (url.startsWith('/') && !url.startsWith('//')) {
        return 'local';
    }

    try {
        const parsed = new URL(url);
        return parsed.origin === 'null' ? 'invalid-url' : parsed.origin;
    } catch {
        return 'invalid-url';
    }
}

/**
 * Извлекает числовой HTTP-статус из ошибки fetch-клиента (statusCode/status/
 * response.status — поля FetchError и совместимых ошибок).
 *
 * @param error - Ошибка запроса data source.
 * @returns Статус ответа или undefined, если его нет.
 */
function extractStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const candidate = error as {
        statusCode?: unknown;
        status?: unknown;
        response?: { status?: unknown };
    };
    const value = candidate.statusCode ?? candidate.status ?? candidate.response?.status;

    return typeof value === 'number' ? value : undefined;
}

/**
 * Сводит произвольную ошибку запроса data source к allow-list полям для
 * production-лога: имя класса ошибки и HTTP-статус. message/request/response/
 * options сознательно не включаются (содержат URL с параметрами и тело ответа).
 *
 * @param error - Ошибка запроса data source.
 * @returns Redacted-представление ошибки.
 */
export function toDataSourceLogError(error: unknown): IDataSourceLogError {
    const name = error instanceof Error ? error.name : typeof error;
    const statusCode = extractStatusCode(error);

    return statusCode === undefined ? { name } : { name, statusCode };
}
