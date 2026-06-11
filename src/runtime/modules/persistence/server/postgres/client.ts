/**
 * Ленивый singleton-пул соединений с PostgreSQL для дефолтного storage-адаптера.
 *
 * БД активна ТОЛЬКО когда задана строка подключения (`bricks.database.url` /
 * `NUXT_BRICKS_DATABASE_URL` / legacy `DATABASE_URL`). Без неё /api/bricks/**
 * должны проксироваться на внешний backend через PROXY_URL (см. proxy.client.ts).
 */
import { useRuntimeConfig } from 'nitropack/runtime';
import type { Pool } from 'pg';

let pool: Pool | null = null;

/**
 * Резолвит строку подключения из runtimeConfig или ENV.
 *
 * @returns Строка подключения PostgreSQL.
 */
function resolveConnectionString(): string {
    const config = useRuntimeConfig();
    const connectionString =
        (config.bricksDatabaseUrl as string | undefined) || process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error(
            '[PostgreSQL] Database connection is not configured. ' +
                'Set bricks.database.url in nuxt.config (or NUXT_BRICKS_DATABASE_URL / DATABASE_URL env), ' +
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
export async function getPool(): Promise<Pool> {
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
        const err = error as { message?: string; code?: string };
        console.error('[PostgreSQL] Query error:', {
            query: text,
            params,
            error: err.message,
            code: err.code,
        });
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
 * Закрывает пул соединений; пригодно для graceful shutdown/test teardown.
 */
export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
