/**
 * CSRF-защита unsafe-запросов bricks-API (аудит A-03).
 *
 * Session-cookie SameSite=Lax не покрывает same-site sibling-домены, а Basic
 * Auth браузер автоповторяет — поэтому unsafe-методы на поверхностях модуля
 * требуют доказательства same-origin: кастомный заголовок `x-bricks-csrf`,
 * либо Sec-Fetch-Site: same-origin/none, либо совпадение ПОЛНОГО origin
 * (схема + hostname + порт; дефолтный порт схемы опускается) заголовка Origin
 * с эффективным origin запроса — эффективный протокол берётся из TLS-состояния
 * сокета либо из последнего хопа x-forwarded-proto при bricks.trustProxy,
 * эффективный host — из Host / последнего хопа x-forwarded-host (ре-ревью
 * A-03: http-origin не same-origin для https-поверхности). Сервис на другом
 * порту/схеме того же хоста same-origin не считается. Запрос без признаков
 * происхождения отклоняется 403.
 */
import { createError, getRequestHeader, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { BRICKS_CSRF_HEADER_NAME } from '../../../modules/common/constants/auth';
import { parseTrustProxyFlag } from '../requestClientIp';

/** Методы, не требующие CSRF-проверки (safe по RFC 9110). */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Значения Sec-Fetch-Site, подтверждающие не-кросс-сайтовый запрос. */
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);

/** Эффективный протокол запроса (socket TLS либо доверенный x-forwarded-proto). */
export type TEffectiveProtocol = 'http' | 'https';

/** Контекст запроса для чистой CSRF-проверки. */
export interface ICsrfRequestContext {
    method: string;
    origin: string | undefined;
    secFetchSite: string | undefined;
    hasCsrfHeader: boolean;
    effectiveHost: string | undefined;
    effectiveProtocol: TEffectiveProtocol;
}

export type TCsrfCheckResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Строит нормализованную форму origin для сравнения: схема + hostname в нижнем
 * регистре без trailing dot + порт. Дефолтный порт СВОЕЙ схемы URL-парсер уже
 * срезал (`http://…:80` → пустой порт), недефолтный (`http://…:443`) —
 * сохранён и участвует в сравнении.
 *
 * @param parsed - Разобранный URL origin'а (заголовок Origin либо
 * `протокол://Host` запроса).
 * @returns Форма `scheme://hostname` либо `scheme://hostname:port`.
 */
function buildComparableOrigin(parsed: URL): string {
    const normalizedHostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

    return parsed.port
        ? `${parsed.protocol}//${normalizedHostname}:${parsed.port}`
        : `${parsed.protocol}//${normalizedHostname}`;
}

/**
 * Нормализованный origin запроса из эффективного протокола и Host-заголовка
 * (может содержать порт). Парсинг под ТОЙ ЖЕ схемой, что и origin-сторона,
 * даёт симметричную нормализацию дефолтного порта.
 *
 * @param protocol - Эффективный протокол запроса.
 * @param host - Значение Host / x-forwarded-host.
 * @returns Нормализованный origin или null для мусорного значения.
 */
function parseComparableRequestOrigin(protocol: TEffectiveProtocol, host: string): string | null {
    try {
        return buildComparableOrigin(new URL(`${protocol}://${host}`));
    } catch {
        return null;
    }
}

/**
 * Путь входит в CSRF-скоуп модуля: весь /api/bricks (включая auth-ручки,
 * которые не под auth-матрицей, media proxy и page thumbnail).
 *
 * @param pathname - Логический путь запроса (без baseURL).
 */
export function isCsrfProtectedPath(pathname: string): boolean {
    return pathname.startsWith('/api/bricks');
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

        let originComparable: string;

        try {
            originComparable = buildComparableOrigin(new URL(context.origin));
        } catch {
            return { allowed: false, reason: 'malformed origin' };
        }

        const requestOrigin = context.effectiveHost
            ? parseComparableRequestOrigin(context.effectiveProtocol, context.effectiveHost)
            : null;

        if (!requestOrigin) {
            return { allowed: false, reason: 'missing effective host' };
        }

        return originComparable === requestOrigin
            ? { allowed: true }
            : {
                  allowed: false,
                  reason: `origin "${originComparable}" does not match request origin "${requestOrigin}"`,
              };
    }

    return { allowed: false, reason: 'no origin evidence (send x-bricks-csrf header)' };
}

/**
 * Эффективный протокол запроса: TLS-состояние сокета; за доверенным прокси —
 * последний хоп x-forwarded-proto (дописан ближайшим прокси, первый спуфится
 * клиентом — паттерн resolveClientIp). Невалидное значение заголовка
 * игнорируется в пользу сокета.
 *
 * @param event - Событие запроса.
 * @param trustProxy - Включён ли bricks.trustProxy.
 */
function resolveEffectiveProtocol(event: H3Event, trustProxy: boolean): TEffectiveProtocol {
    const forwardedProto = trustProxy
        ? getRequestHeader(event, 'x-forwarded-proto')?.split(',').at(-1)?.trim().toLowerCase()
        : undefined;

    if (forwardedProto === 'http' || forwardedProto === 'https') {
        return forwardedProto;
    }

    const socket = event.node.req.socket as { encrypted?: boolean } | undefined;

    return socket?.encrypted ? 'https' : 'http';
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
    // Последний токен x-forwarded-host дописан ближайшим доверенным прокси;
    // первый спуфится клиентом при аппендящем прокси (паттерн resolveClientIp)
    const forwardedHost = trustProxy
        ? getRequestHeader(event, 'x-forwarded-host')?.split(',').at(-1)?.trim()
        : undefined;

    const result = checkCsrf({
        method,
        origin: getRequestHeader(event, 'origin'),
        secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
        hasCsrfHeader: Boolean(getRequestHeader(event, BRICKS_CSRF_HEADER_NAME)),
        effectiveHost: forwardedHost || getRequestHeader(event, 'host'),
        effectiveProtocol: resolveEffectiveProtocol(event, trustProxy),
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
