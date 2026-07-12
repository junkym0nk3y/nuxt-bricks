/**
 * CSRF-защита unsafe-запросов bricks-API (аудит A-03).
 *
 * Session-cookie SameSite=Lax не покрывает same-site sibling-домены, а Basic
 * Auth браузер автоповторяет — поэтому unsafe-методы на поверхностях модуля
 * требуют доказательства same-origin: кастомный заголовок `x-bricks-csrf`,
 * либо Sec-Fetch-Site: same-origin/none, либо совпадение hostname Origin
 * с эффективным Host запроса (x-forwarded-host при bricks.trustProxy).
 * Запрос без признаков происхождения отклоняется 403.
 */
import { createError, getRequestHeader, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { BRICKS_CSRF_HEADER_NAME } from '../../../modules/common/constants/auth';
import { parseTrustProxyFlag } from '../requestClientIp';

/** Методы, не требующие CSRF-проверки (safe по RFC 9110). */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Значения Sec-Fetch-Site, подтверждающие не-кросс-сайтовый запрос. */
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);

/** Контекст запроса для чистой CSRF-проверки. */
export interface ICsrfRequestContext {
    method: string;
    origin: string | undefined;
    secFetchSite: string | undefined;
    hasCsrfHeader: boolean;
    effectiveHost: string | undefined;
}

export type TCsrfCheckResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Извлекает hostname из значения Host-заголовка (может содержать порт).
 *
 * @param host - Значение Host / x-forwarded-host.
 * @returns hostname в нижнем регистре или null для мусорного значения.
 */
function parseHostHeaderHostname(host: string): string | null {
    try {
        return new URL(`http://${host}`).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Путь входит в CSRF-скоуп модуля: весь /api/bricks (включая auth-ручки,
 * которые не под auth-матрицей) и S3-операции mock-api.
 *
 * @param pathname - Логический путь запроса (без baseURL).
 */
export function isCsrfProtectedPath(pathname: string): boolean {
    return pathname.startsWith('/api/bricks') || pathname.startsWith('/mock-api/s3-');
}

/**
 * Чистая CSRF-проверка контекста запроса (порядок: safe-метод → кастомный
 * заголовок → Sec-Fetch-Site → Origin → отказ).
 *
 * @param context - Извлечённые из запроса признаки происхождения.
 * @returns Результат; при отказе — машиночитаемая причина для лога.
 */
export function checkCsrf(context: ICsrfRequestContext): TCsrfCheckResult {
    if (SAFE_METHODS.has(context.method.toUpperCase())) {
        return { allowed: true };
    }

    if (context.hasCsrfHeader) {
        return { allowed: true };
    }

    if (context.secFetchSite) {
        return TRUSTED_FETCH_SITES.has(context.secFetchSite.toLowerCase())
            ? { allowed: true }
            : { allowed: false, reason: `sec-fetch-site "${context.secFetchSite}"` };
    }

    if (context.origin) {
        if (context.origin === 'null') {
            return { allowed: false, reason: 'opaque origin' };
        }

        let originHostname: string;

        try {
            originHostname = new URL(context.origin).hostname.toLowerCase();
        } catch {
            return { allowed: false, reason: 'malformed origin' };
        }

        const hostHostname = context.effectiveHost
            ? parseHostHeaderHostname(context.effectiveHost)
            : null;

        if (!hostHostname) {
            return { allowed: false, reason: 'missing effective host' };
        }

        return originHostname === hostHostname
            ? { allowed: true }
            : {
                  allowed: false,
                  reason: `origin "${originHostname}" does not match host "${hostHostname}"`,
              };
    }

    return { allowed: false, reason: 'no origin evidence (send x-bricks-csrf header)' };
}

/**
 * h3-обвязка: собирает контекст из заголовков и кидает 403 при отказе.
 * Причина отказа уходит только в server-лог (не в ответ).
 *
 * @param event - Событие запроса.
 */
export function assertCsrfSafe(event: H3Event): void {
    const method = event.node.req.method || 'GET';

    if (SAFE_METHODS.has(method)) {
        return;
    }

    const trustProxy = parseTrustProxyFlag(useRuntimeConfig(event).bricksTrustProxy);
    const forwardedHost = trustProxy
        ? getRequestHeader(event, 'x-forwarded-host')?.split(',')[0]?.trim()
        : undefined;

    const result = checkCsrf({
        method,
        origin: getRequestHeader(event, 'origin'),
        secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
        hasCsrfHeader: Boolean(getRequestHeader(event, BRICKS_CSRF_HEADER_NAME)),
        effectiveHost: forwardedHost || getRequestHeader(event, 'host'),
    });

    if (result.allowed) {
        return;
    }

    console.warn('[nuxt-bricks] CSRF check rejected request:', {
        path: event.node.req.url,
        method,
        reason: result.reason,
    });

    throw createError({ statusCode: 403, statusMessage: 'Cross-site request rejected' });
}
