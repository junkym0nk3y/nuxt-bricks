/**
 * The lazy singleton pool of PostgreSQL connections for the default storage
 * adapter.
 *
 * The database is active ONLY when the connection string is set
 * (`NUXT_BRICKS_DATABASE_URL` / `bricks.database.url`) — the builtin mode of
 * bricks.backend.mode (see module-backend-config.ts).
 */
import { useRuntimeConfig } from 'nitropack/runtime';
import type { ClientBase, Pool, PoolClient } from 'pg';
import type { IApiError } from '../../../common/types/bricks-api';
import { buildPostgresPoolConfig, STATEMENT_TIMEOUT_APPLY_TIMEOUT_MS } from './poolConfig';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';
import type { IPostgresPoolConfig } from '../../types/postgres';
import {
    BricksPostgresQueryNotStartedError,
    BricksStatementTimeoutError,
} from '../utils/storageErrors';

let pool: Pool | null = null;

/**
 * Resolves the connection string from runtimeConfig or ENV.
 *
 * @param config - The Nitro runtimeConfig.
 * @returns The PostgreSQL connection string.
 */
function resolveConnectionString(config: Record<string, unknown>): string {
    const connectionString = config.bricksDatabaseUrl as string | undefined;

    if (!connectionString) {
        throw new Error(
            '[PostgreSQL] Database connection is not configured. ' +
                'Set NUXT_BRICKS_DATABASE_URL env (or bricks.database.url in nuxt.config) ' +
                'for bricks.backend.mode = "builtin", or switch to backend.mode = "external" ' +
                'with backend.url pointing at your HTTP backend.'
        );
    }

    return connectionString;
}

/**
 * Dynamically imports the `pg` driver (an optional peer dependency: external mode
 * must not require installing it or resolving it in Vite) with a clear installation
 * error.
 *
 * @returns The pg driver module.
 */
async function importPgDriver(): Promise<typeof import('pg')> {
    try {
        return await import('pg');
    } catch (error: unknown) {
        throw new Error(
            '[PostgreSQL] Failed to load the "pg" driver. Install it with `npm install pg` — ' +
                'it is required only for bricks.backend.mode = "builtin".',
            { cause: error }
        );
    }
}

/**
 * Sets the server-side limit in the session itself right after connecting.
 *
 * The startup parameter is not enough: the driver lays the parsed connection string
 * over the configuration object, so a `statement_timeout` in the URL would override
 * our value and could lift the limit entirely. Tracking that by parsing the string
 * cannot be done reliably — the driver has a grammar of its own (decoding a `%5F`
 * in a parameter's name, recovering a URL with no host) — while the `SET` runs after
 * the session has started and overrides any variant of it.
 *
 * The moment is not chosen at random: `pg-pool` AWAITS this hook and only then hands
 * the connection out, so the first query cannot outrun it. The value goes out as a
 * parameter (`set_config` rather than interpolation into the text of a `SET`).
 *
 * A deadline of its own is needed because `connectionTimeoutMillis` does not reach
 * here: `pg-pool` clears the connection timer right after `client.connect()` and only
 * then waits for the hook. A hung `set_config` would otherwise hold the waiter with
 * no ceiling whatsoever, and the connection counted in the pool — that is, it would
 * bring back the very defect the limit is introduced for. A failure of the hook is
 * handled by the pool itself: the connection is destroyed, the slot is freed, the
 * error goes to the caller.
 *
 * @param client - The connection of the pool that has just connected.
 * @param poolConfig - The pool configuration: the limit's value is taken from here.
 */
async function applyStatementTimeout(
    client: ClientBase,
    poolConfig: IPostgresPoolConfig
): Promise<void> {
    await withPromiseDeadline(
        client.query('SELECT set_config($1, $2, false)', [
            'statement_timeout',
            String(poolConfig.statement_timeout),
        ]),
        STATEMENT_TIMEOUT_APPLY_TIMEOUT_MS,
        () =>
            new Error(
                '[PostgreSQL] Timed out while applying the statement timeout to a new connection'
            )
    );
}

/**
 * Takes a connection out of the pool, bringing a failure to the same shape as an
 * ordinary query's.
 *
 * A wrapper of its own is needed because of the limit-setting hook: its failure
 * arrives out of `connect()` specifically, that is, before the first `BEGIN`, and
 * without this place the transactional path would return a generic 500 where an
 * ordinary query returns an honest failure code.
 *
 * @param clientPool - The connection pool.
 * @returns The allocated pool client.
 */
async function acquireClient(clientPool: Pool): Promise<PoolClient> {
    try {
        return await clientPool.connect();
    } catch (error: unknown) {
        const err = error as IApiError;
        console.error('[PostgreSQL] Failed to acquire a connection:', {
            error: err.message,
            code: err.code,
        });

        throw toDomainQueryError(error);
    }
}

/**
 * Returns the singleton pool of PostgreSQL connections, creating it lazily.
 *
 * @returns The connection pool.
 */
async function getPool(): Promise<Pool> {
    if (!pool) {
        const config = useRuntimeConfig();
        const connectionString = resolveConnectionString(config);
        const { Pool: PgPool } = await importPgDriver();
        const poolConfig = buildPostgresPoolConfig(
            connectionString,
            config.bricksDatabaseStatementTimeoutMs
        );

        pool = new PgPool({
            ...poolConfig,
            onConnect: (client: ClientBase) => applyStatementTimeout(client, poolConfig),
        });

        pool.on('error', (err: Error) => {
            console.error('[PostgreSQL] Unexpected error on idle client', err);
        });
    }

    return pool;
}

/**
 * The "schema does not match the code" SQLSTATE codes: undefined_table /
 * undefined_column.
 */
const MISSING_SCHEMA_CODES = new Set(['42P01', '42703']);

/**
 * SQLSTATE query_canceled: the query was canceled — for us that is
 * statement_timeout firing.
 */
const QUERY_CANCELED_CODE = '57014';

/**
 * Translates a cancellation of the query by the server-side limit into a domain
 * error, so that knowledge of SQLSTATE does not spread beyond this module: the HTTP
 * layer tells such a failure apart by the error's class, just as it does write
 * conflicts.
 *
 * Other errors are returned as they are — they are examined by the callers
 * (`isUniqueViolation` in the adapter).
 *
 * @param error - The caught driver error.
 * @returns The domain error, or the original one.
 */
function toDomainQueryError(error: unknown): unknown {
    if ((error as IApiError)?.code === QUERY_CANCELED_CODE) {
        return new BricksStatementTimeoutError(error);
    }

    return error;
}

/**
 * Adds a hint about the migrations to the log when the error looks like an unapplied
 * bricks_* schema (the adapters run no runtime DDL).
 *
 * @param err - The query error with its SQLSTATE code.
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
 * Runs a parameterized SELECT/INSERT/UPDATE/DELETE and returns the rows.
 *
 * @param text - The SQL with placeholders ($1, $2).
 * @param params - The parameters for the placeholders.
 * @returns The array of result rows.
 */
export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
    let client: Pool;

    // Assembling the pool is a phase of its own: its failure means the SQL was
    // never sent, and the caller is entitled to treat the operation's outcome as
    // determined
    try {
        client = await getPool();
    } catch (error: unknown) {
        console.error('[PostgreSQL] Query was not sent:', (error as IApiError).message);

        throw new BricksPostgresQueryNotStartedError(error);
    }

    try {
        const result = await client.query(text, params);
        return result.rows as T[];
    } catch (error: unknown) {
        const err = error as IApiError;
        // query/params carry page content — in production only code/message is logged
        console.error('[PostgreSQL] Query error:', {
            error: err.message,
            code: err.code,
            ...(process.env.NODE_ENV === 'production' ? {} : { query: text, params }),
        });
        logMissingSchemaHint(err);
        throw toDomainQueryError(error);
    }
}

/**
 * Runs a query and returns one row, or null.
 *
 * @param text - The SQL with placeholders.
 * @param params - The query's parameters.
 * @returns The first row of the result, or null.
 */
export async function queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
}

/**
 * A query inside an open transaction (the same contract as `query`).
 */
export type TTransactionQuery = <T>(text: string, params?: unknown[]) => Promise<T[]>;

/**
 * Runs a callback in a transaction on an allocated pool client
 * (BEGIN → fn → COMMIT, and a ROLLBACK on an error). The ordinary `query()` goes
 * through `pool.query` and is unfit for transactions — every call can land on a
 * different connection.
 *
 * @param fn - The callback with the transactional version of query.
 * @returns The callback's result.
 */
export async function withTransaction<T>(
    fn: (txQuery: TTransactionQuery) => Promise<T>
): Promise<T> {
    const clientPool = await getPool();
    const client = await acquireClient(clientPool);

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
        // A ROLLBACK over a dead connection must not shadow the original error
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
        throw toDomainQueryError(error);
    } finally {
        client.release();
    }
}
