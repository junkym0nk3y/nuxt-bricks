/**
 * Выбор persistence-пути для readiness probe (аудит A-05): конфигурация без
 * БД, без proxy и без кастомного адаптера означает, что editorial CRUD
 * фактически отвечает 500 — readiness обязан быть 503, а не зелёным.
 */

/** Проверяемый readiness'ом persistence-путь. */
export type TReadinessTarget = 'adapter' | 'proxy' | 'none';

/** Признаки сконфигурированных persistence-путей. */
export interface IReadinessTargetInput {
    hasDatabaseUrl: boolean;
    hasProxyUrl: boolean;
    hasCustomAdapter: boolean;
}

/**
 * Проверяет HTTP-статус reachability-пробы downstream-proxy (health-эндпоинт
 * не сконфигурирован): коды < 500 (включая 404/405 — endpoint жив, путь/метод
 * не поддержан) подтверждают работающий backend; 5xx — деградация, не
 * готовность (ре-ревью A-05). Осознанное ограничение: неверный PROXY_URL-путь
 * или отсутствующий editorial API на живом хосте так не детектируются —
 * для строгой проверки задаётся `bricks.proxy.healthUrl`.
 *
 * @param status - HTTP-статус ответа proxy.
 */
export function isProxyStatusReady(status: number): boolean {
    return status < 500;
}

/**
 * Проверяет HTTP-статус сконфигурированного health-эндпоинта backend'а
 * (`bricks.proxy.healthUrl` / NUXT_BRICKS_PROXY_HEALTH_URL): готовность —
 * только 2xx; 404 по health-URL означает неверную конфигурацию, не готовность.
 *
 * @param status - HTTP-статус ответа health-эндпоинта.
 */
export function isProxyHealthStatusReady(status: number): boolean {
    return status >= 200 && status < 300;
}

/**
 * Определяет, какой persistence-путь должен подтвердить готовность.
 *
 * @param input - Признаки конфигурации.
 */
export function resolveReadinessTarget(input: IReadinessTargetInput): TReadinessTarget {
    if (input.hasCustomAdapter || input.hasDatabaseUrl) {
        return 'adapter';
    }

    if (input.hasProxyUrl) {
        return 'proxy';
    }

    return 'none';
}
