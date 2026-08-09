/**
 * Ленивый singleton-пул соединений с PostgreSQL для дефолтного storage-адаптера.
 *
 * БД активна ТОЛЬКО когда задана строка подключения
 * (`NUXT_BRICKS_DATABASE_URL` / `bricks.database.url`) — builtin-режим
 * bricks.backend.mode (см. module-backend-config.ts).
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
 * Резолвит строку подключения из runtimeConfig или ENV.
 *
 * @param config - runtimeConfig Nitro.
 * @returns Строка подключения PostgreSQL.
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
 * Динамически импортирует драйвер `pg` (optional peer-зависимость: external-режим
 * не должен требовать его установки и резолва Vite) с понятной ошибкой установки.
 *
 * @returns Модуль драйвера pg.
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
 * Ставит серверный лимит в самой сессии сразу после подключения.
 *
 * Startup-параметра недостаточно: драйвер накладывает разобранную строку
 * подключения поверх объекта конфигурации, поэтому `statement_timeout` в URL
 * перебивал бы наше значение и мог бы снять лимит совсем. Отследить это
 * разбором строки нельзя надёжно — у драйвера своя грамматика (декодирование
 * `%5F` в имени параметра, восстановление URL без хоста), — а `SET` выполняется
 * позже старта сессии и перекрывает любой её вариант.
 *
 * Момент выбран не случайно: `pg-pool` ДОЖИДАЕТСЯ этого хука и только потом
 * выдаёт соединение, поэтому первый запрос не может его обогнать. Значение
 * уходит параметром (`set_config`, а не интерполяция в текст `SET`).
 *
 * Свой дедлайн нужен потому, что `connectionTimeoutMillis` сюда не достаёт:
 * `pg-pool` снимает таймер подключения сразу после `client.connect()` и только
 * затем ждёт хук. Зависший `set_config` иначе держал бы ожидающего без всякого
 * потолка, а соединение — учтённым в пуле, то есть возвращал бы ровно тот
 * дефект, ради которого лимит и заводится. Отказ хука пул обрабатывает сам:
 * соединение уничтожается, слот освобождается, ошибка уходит вызывающему.
 *
 * @param client - Только что подключённое соединение пула.
 * @param poolConfig - Конфигурация пула: отсюда берётся значение лимита.
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
 * Берёт соединение из пула, приводя отказ к тому же виду, что и у обычного
 * запроса.
 *
 * Отдельная обёртка нужна из-за хука установки лимита: его отказ приходит
 * именно из `connect()`, то есть до первого `BEGIN`, и без этого места
 * транзакционный путь отдавал бы generic 500 там, где обычный запрос отдаёт
 * честный код отказа.
 *
 * @param clientPool - Пул соединений.
 * @returns Выделенный клиент пула.
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
 * Возвращает singleton-пул соединений с PostgreSQL, лениво создавая его.
 *
 * @returns Пул соединений.
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

/** SQLSTATE-коды «схема не соответствует коду»: undefined_table / undefined_column. */
const MISSING_SCHEMA_CODES = new Set(['42P01', '42703']);

/** SQLSTATE query_canceled: запрос отменён — у нас это срабатывание statement_timeout. */
const QUERY_CANCELED_CODE = '57014';

/**
 * Переводит отмену запроса серверным лимитом в доменную ошибку, чтобы знание о
 * SQLSTATE не расходилось за пределы этого модуля: HTTP-слой различает такой
 * отказ по классу ошибки, как и конфликты записи.
 *
 * Прочие ошибки возвращаются как есть — их разбирают вызывающие
 * (`isUniqueViolation` в адаптере).
 *
 * @param error - Пойманная ошибка драйвера.
 * @returns Доменная ошибка либо исходная.
 */
function toDomainQueryError(error: unknown): unknown {
    if ((error as IApiError)?.code === QUERY_CANCELED_CODE) {
        return new BricksStatementTimeoutError(error);
    }

    return error;
}

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
    let client: Pool;

    // Сборка пула — отдельная фаза: её отказ означает, что SQL не отправлялся,
    // и вызывающий вправе считать исход операции определённым
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
        // query/params содержат контент страниц — в production логируем только code/message
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
        throw toDomainQueryError(error);
    } finally {
        client.release();
    }
}
