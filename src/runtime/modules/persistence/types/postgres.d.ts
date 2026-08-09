/**
 * Контракт конфигурации пула PostgreSQL (`server/postgres/poolConfig.ts`).
 *
 * Форма описана своими полями, а не через `PoolConfig` драйвера: `pg` —
 * optional peer-зависимость (external-режим её не требует), и тип конфигурации
 * не должен тянуть за собой её резолв.
 */

/**
 * Ошибка драйвера `pg` в объёме, который разбирает адаптер: SQLSTATE-код отказа.
 *
 * Форма своя, а не `DatabaseError` драйвера, по той же причине, что и у
 * конфигурации пула: `pg` — optional peer-зависимость, и тип не должен тянуть
 * за собой её резолв.
 */
export interface IPostgresErrorLike {
    /** SQLSTATE отказа ('23505' unique_violation, '23503' foreign_key_violation). */
    code?: unknown;
    /** Имя нарушенного ограничения — им различаются несколько ограничений одной таблицы. */
    constraint?: unknown;
}

export interface IPostgresPoolConfig {
    /** Строка подключения PostgreSQL. */
    connectionString: string;
    /** Максимум соединений в пуле. */
    max: number;
    /** Сколько держать простаивающее соединение перед закрытием, мс. */
    idleTimeoutMillis: number;
    /** Потолок ожидания свободного соединения из пула, мс. */
    connectionTimeoutMillis: number;
    /**
     * Серверный лимит на исполнение ОДНОГО statement, мс: PostgreSQL отменяет
     * запрос сам и освобождает соединение.
     */
    statement_timeout: number;
}
