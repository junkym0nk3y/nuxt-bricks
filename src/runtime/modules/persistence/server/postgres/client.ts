/**
 * Ленивый singleton-пул соединений с PostgreSQL для дефолтного storage-адаптера.
 *
 * БД активна ТОЛЬКО когда задана строка подключения
 * (`NUXT_BRICKS_DATABASE_URL` / `bricks.database.url`). Без неё /api/bricks/**
 * должны проксироваться на внешний backend через PROXY_URL (см. proxy.client.ts).
 */
import { useRuntimeConfig } from 'nitropack/runtime';
import type { Pool } from 'pg';
import type { IApiError } from '../../../common/types/bricks-api';

let pool: Pool | null = null;

/**
 * Резолвит строку подключения из runtimeConfig или ENV.
 *
 * @returns Строка подключения PostgreSQL.
 */
function resolveConnectionString(): string {
    const config = useRuntimeConfig();
    const connectionString = config.bricksDatabaseUrl as string | undefined;

    if (!connectionString) {
        throw new Error(
            '[PostgreSQL] Database connection is not configured. ' +
                'Set NUXT_BRICKS_DATABASE_URL env (or bricks.database.url in nuxt.config), ' +
                'or set PROXY_URL to proxy /api requests to an external backend.'
        );
    }

    return connectionString;
}

/**
 * Возвращает singleton-пул соединений с PostgreSQL, лениво создавая его.
 * `pg` импортируется динамически: это optional peer-зависимость, и она
 * не должна резолвиться Vite в proxy-режиме без установленного драйвера.
 *
 * @returns Пул соединений.
 */
async function getPool(): Promise<Pool> {
    if (!pool) {
        const connectionString = resolveConnectionString();
        const { Pool: PgPool } = await import('pg');

        pool = new PgPool({
            connectionString,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        pool.on('error', (err: Error) => {
            console.error('[PostgreSQL] Unexpected error on idle client', err);
        });
    }

    return pool;
}

/** SQLSTATE-коды «схема не соответствует коду»: undefined_table / undefined_column. */
const MISSING_SCHEMA_CODES = new Set(['42P01', '42703']);

/**
 * Дописывает в лог подсказку про миграции, если ошибка похожа на
 * непримененную схему bricks_* (runtime-DDL адаптеры не выполняют).
 *
 * @param err - Ошибка запроса с кодом SQLSTATE.
 */
function logMissingSchemaHint(err: IApiError): void {
    if (err.code && MISSING_SCHEMA_CODES.has(err.code) && err.message?.includes('bricks_')) {
        console.error(
            '[PostgreSQL] Schema for nuxt-bricks tables is missing or outdated. ' +
                'Run `npx bricks-migrate migrate` against this database.'
        );
    }
}

/**
 * Выполняет параметризованный SELECT/INSERT/UPDATE/DELETE и возвращает rows.
 *
 * @param text - SQL с плейсхолдерами ($1, $2).
 * @param params - Параметры под плейсхолдеры.
 * @returns Массив строк результата.
 */
export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
    try {
        const client = await getPool();
        const result = await client.query(text, params);
        return result.rows as T[];
    } catch (error: unknown) {
        const err = error as IApiError;
        // query/params содержат контент страниц — в production логируем только code/message
        console.error('[PostgreSQL] Query error:', {
            error: err.message,
            code: err.code,
            ...(process.env.NODE_ENV === 'production' ? {} : { query: text, params }),
        });
        logMissingSchemaHint(err);
        throw error;
    }
}

/**
 * Выполняет запрос и возвращает одну строку или null.
 *
 * @param text - SQL с плейсхолдерами.
 * @param params - Параметры запроса.
 * @returns Первая строка результата или null.
 */
export async function queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Запрос внутри открытой транзакции (тот же контракт, что у `query`).
 */
export type TTransactionQuery = <T>(text: string, params?: unknown[]) => Promise<T[]>;

/**
 * Выполняет колбэк в транзакции на выделенном клиенте пула
 * (BEGIN → fn → COMMIT, при ошибке — ROLLBACK). Обычный `query()` идёт через
 * `pool.query` и для транзакций не подходит — каждый вызов может попасть
 * на другое соединение.
 *
 * @param fn - Колбэк с транзакционной версией query.
 * @returns Результат колбэка.
 */
export async function withTransaction<T>(
    fn: (txQuery: TTransactionQuery) => Promise<T>
): Promise<T> {
    const clientPool = await getPool();
    const client = await clientPool.connect();

    const txQuery: TTransactionQuery = async <R>(
        text: string,
        params?: unknown[]
    ): Promise<R[]> => {
        const result = await client.query(text, params);
        return result.rows as R[];
    };

    try {
        await client.query('BEGIN');
        const result = await fn(txQuery);
        await client.query('COMMIT');
        return result;
    } catch (error: unknown) {
        // ROLLBACK на мёртвом соединении не должен затенить исходную ошибку
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError: unknown) {
            console.error('[PostgreSQL] Rollback failed', rollbackError);
        }

        const err = error as IApiError;
        console.error('[PostgreSQL] Transaction error:', {
            error: err.message,
            code: err.code,
        });
        logMissingSchemaHint(err);
        throw error;
    } finally {
        client.release();
    }
}
