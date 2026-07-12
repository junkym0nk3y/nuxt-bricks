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
