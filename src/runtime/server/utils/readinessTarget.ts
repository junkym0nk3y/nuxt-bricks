/**
 * Выбор persistence-пути для readiness probe: конфигурация без
 * БД и без адаптера означает, что editorial CRUD фактически отвечает 500 —
 * readiness обязан быть 503, а не зелёным.
 */

/** Проверяемый readiness'ом persistence-путь. */
export type TReadinessTarget = 'adapter' | 'none';

/** Признаки сконфигурированных persistence-путей. */
export interface IReadinessTargetInput {
    /** Build-time фабрика external-режима установлена (плагин externalBackendStorage). */
    hasExternalBackend: boolean;
    hasDatabaseUrl: boolean;
    hasCustomAdapter: boolean;
}

/**
 * Определяет, какой persistence-путь должен подтвердить готовность.
 *
 * `external` идёт adapter-путём (checkHealth HTTP-адаптера — GET по backend
 * health URL либо `GET {base}`); для `builtin` adapter-путь требует БД или
 * кастомного адаптера. PROXY_URL persistence не выбирает — dev-проксирование
 * не-bricks /api/* на готовность editorial API не влияет.
 *
 * @param input - Признаки конфигурации.
 */
export function resolveReadinessTarget(input: IReadinessTargetInput): TReadinessTarget {
    if (input.hasCustomAdapter || input.hasExternalBackend || input.hasDatabaseUrl) {
        return 'adapter';
    }

    return 'none';
}
