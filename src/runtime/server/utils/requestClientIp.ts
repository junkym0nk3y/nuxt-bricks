/**
 * Резолв клиентского IP для rate limiter'ов.
 *
 * По умолчанию используется только socket-адрес соединения — заголовкам
 * x-forwarded-* модуль не доверяет (их может прислать сам клиент).
 * За reverse proxy socket-адрес у всех запросов одинаковый (адрес прокси),
 * и per-IP лимиты схлопываются в один общий bucket — для этого случая есть
 * опт-ин `bricks.trustProxy` (env NUXT_BRICKS_TRUST_PROXY): берётся
 * **последний** элемент `x-forwarded-for` — тот, что дописал ближайший
 * доверенный прокси-хоп; первый элемент клиент может подделать, прислав
 * собственный заголовок (аппендящий прокси его сохранит).
 *
 * Ограничение: trustProxy рассчитан ровно на один доверенный прокси-хоп
 * перед приложением. Цепочки из нескольких прокси требуют, чтобы внешний
 * хоп перезаписывал x-forwarded-for.
 */
import { getRequestHeader, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';

/** Строковые значения флага, считающиеся включением (env-переменные — строки). */
const TRUTHY_FLAG_VALUES = new Set(['true', '1', 'yes', 'on']);

/** Ключ-заглушка, когда IP определить не удалось. */
const UNKNOWN_CLIENT_IP = 'unknown';

/**
 * Приводит значение runtimeConfig/env к булеву флагу trustProxy.
 *
 * @param value - Значение `bricksTrustProxy` (boolean из опций или строка из env).
 */
export function parseTrustProxyFlag(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        return TRUTHY_FLAG_VALUES.has(value.trim().toLowerCase());
    }

    return false;
}

/**
 * Чистый резолв клиентского IP из заголовка и socket-адреса.
 *
 * @param xForwardedFor - Значение заголовка x-forwarded-for (как пришло).
 * @param socketAddress - remoteAddress socket-соединения.
 * @param trustProxy - Доверять ли x-forwarded-for (ближайшему прокси-хопу).
 */
export function resolveClientIp(
    xForwardedFor: string | undefined,
    socketAddress: string | undefined,
    trustProxy: boolean
): string {
    if (trustProxy && xForwardedFor) {
        const lastHopEntry = xForwardedFor
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .at(-1);

        if (lastHopEntry) {
            return lastHopEntry;
        }
    }

    return socketAddress || UNKNOWN_CLIENT_IP;
}

/**
 * Возвращает клиентский IP запроса с учётом конфигурации trustProxy.
 *
 * @param event - Событие запроса.
 */
export function resolveRequestClientIp(event: H3Event): string {
    const trustProxy = parseTrustProxyFlag(useRuntimeConfig(event).bricksTrustProxy);

    return resolveClientIp(
        getRequestHeader(event, 'x-forwarded-for'),
        event.node.req.socket?.remoteAddress ?? undefined,
        trustProxy
    );
}
