/**
 * Контракт конфигурации пула PostgreSQL (`server/postgres/poolConfig.ts`) и
 * формы строк результата, которые адаптеры приводят к контрактам `types/adapters`.
 *
 * Форма пула описана своими полями, а не через `PoolConfig` драйвера: `pg` —
 * optional peer-зависимость (external-режим её не требует), и тип конфигурации
 * не должен тянуть за собой её резолв.
 */
import type { IAuthUserSummary } from './adapters';
import type { TBricksUserRole } from '../../common/types/auth';

/**
 * Строка учётки из `bricks_users` до нормализации даты: TIMESTAMPTZ-колонку
 * node-postgres отдаёт как `Date`, а контракт требует ISO-строку.
 */
export interface IAuthUserSummaryRow extends Omit<IAuthUserSummary, 'createdAt'> {
    createdAt: string | Date;
}

/**
 * Состояние учётки, нужное краевым правилам управления (читается под
 * `FOR UPDATE` вместе с набором активных администраторов).
 */
export interface IAuthUserStateRow {
    id: number;
    role: TBricksUserRole;
    isActive: boolean;
}

/**
 * Исход мутации учётки под блокировкой набора активных администраторов.
 *
 * Отказ краевого правила возвращается флагом, а не исключением изнутри
 * транзакции: `withTransaction` логирует любую пойманную ошибку как сбой
 * транзакции, и штатный отказ («последнего администратора не понизить») уезжал
 * бы в лог сбоем базы. Ошибку создаёт вызывающий, уже вне транзакции.
 */
export interface IGuardedUserMutation {
    isRefused: boolean;
    /** Новое состояние строки; null — мутация ничего не возвращает (удаление). */
    user: IAuthUserSummary | null;
}

/** Строка JOIN-результата сессии с полями пользователя (алиасы camelCase). */
export interface IAuthSessionJoinRow {
    tokenHash: string;
    /** TIMESTAMPTZ-колонка: node-postgres возвращает Date. */
    expiresAt: string | Date;
    lastUsedAt: string;
    userId: number;
    username: string;
    isActive: boolean;
    role: TBricksUserRole;
    displayName: string | null;
    avatarUrl: string | null;
}

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
