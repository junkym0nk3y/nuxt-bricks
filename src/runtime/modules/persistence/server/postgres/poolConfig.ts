/**
 * The PostgreSQL pool configuration: sizes and server-side limits.
 *
 * Moved out of `client.ts` into a module of its own with no `pg` import: the
 * limit's value arrives from the configuration (that is, as a string out of ENV)
 * and its resolution needs to be checked by unit tests, while `pg` is an optional
 * peer dependency.
 */

// #region Imports
// Types
import type { IPostgresPoolConfig } from '../../types/postgres';
// #endregion

// #region Constants
/**
 * The default server-side ceiling on executing one statement.
 *
 * Why it is needed: a client-side waiting ceiling frees the waiter (an SSR
 * visitor, an operation flag in the builder) but not the resource — a request
 * canceled on the client goes on holding a connection from the pool. The pool is
 * finite, so a series of such requests would exhaust it, and a cure for UX would
 * turn into a denial of service. Only PostgreSQL itself can cancel a query.
 *
 * Why eight seconds: a read has a client-side ceiling of 10 s, and the limit is
 * set below it by the margin adopted in the project (2 s) — so that in the typical
 * case the user gets a clear refusal from the server rather than an abort of their
 * own.
 *
 * This does NOT guarantee the order "the server answers before the client", and
 * logic must not be built on it: the limit bounds each statement separately rather
 * than the request as a whole. One HTTP request executes several of them (the
 * database-auth session check, then BEGIN, the snapshot, the write, the history
 * cleanup, COMMIT), and up to two seconds can go on getting a connection out of the
 * pool (`connectionTimeoutMillis`) — the server-side timer only starts after that.
 * The limit's goal is to free the connection; the budget of the whole operation
 * lives on the client's side.
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 8_000;

/**
 * The upper bound of `statement_timeout` in PostgreSQL: the value is stored as
 * int32 ms.
 */
const MAX_STATEMENT_TIMEOUT_MS = 2_147_483_647;

/** The cap on connections in the pool. */
const POOL_MAX_CONNECTIONS = 20;

/** How long to hold an idle connection before closing it, ms. */
const POOL_IDLE_TIMEOUT_MS = 30_000;

/** The ceiling on waiting for a free connection from the pool, ms. */
const POOL_CONNECTION_TIMEOUT_MS = 2_000;

/**
 * The ceiling on setting the limit in a new session (`client.ts`).
 *
 * The value is the same as for getting a connection, but the budget is a separate
 * and sequential one: the pool clears its own timer before calling the hook, so
 * getting a usable client takes, in the worst case, the sum of the two ceilings
 * rather than one. It can be kept short: by the time of the hook the connection is
 * already established, and `set_config` is a cheap local command; a slow database
 * start shows up earlier, in the connection phase.
 */
export const STATEMENT_TIMEOUT_APPLY_TIMEOUT_MS = POOL_CONNECTION_TIMEOUT_MS;
// #endregion

// #region Methods
/**
 * Resolves the server-side statement limit from the configuration (ENV values
 * arrive as strings). A fractional value is rounded down.
 *
 * There is deliberately no opt-out: `0` and `false` are not "no limit" but a quiet
 * return of the original defect, in which a hung query holds a connection until the
 * end of the process's life. A legitimately long query is served by a large finite
 * value, not by lifting the limit.
 *
 * @param raw - The value from runtimeConfig (a number, a string, or nothing).
 * @returns The limit in milliseconds.
 */
export function resolveStatementTimeoutMs(raw: unknown): number {
    if (raw === undefined || raw === null || raw === '') {
        return DEFAULT_STATEMENT_TIMEOUT_MS;
    }

    // The type is checked ahead of Number(): otherwise `true` would become a
    // limit of 1 ms, under which not a single query goes through. The value also
    // arrives through the Nitro env, where the string "true" is parsed into a
    // boolean — that is, a typo in an environment variable would stop all database
    // work instead of falling back to the default with a warning
    const parsed =
        typeof raw === 'number' || typeof raw === 'string' ? Math.floor(Number(raw)) : Number.NaN;

    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_STATEMENT_TIMEOUT_MS) {
        // A default substituted silently would look like an accepted setting: an
        // attempt to switch the limit off with a zero would appear to have worked
        console.warn(
            `[PostgreSQL] Ignoring statement timeout value "${String(raw)}": expected an integer ` +
                `between 1 and ${MAX_STATEMENT_TIMEOUT_MS} ms. ` +
                `Falling back to ${DEFAULT_STATEMENT_TIMEOUT_MS} ms.`
        );

        return DEFAULT_STATEMENT_TIMEOUT_MS;
    }

    return parsed;
}

/**
 * Whether the connection string carries a `statement_timeout` of its own.
 *
 * The driver lays the parsed URL OVER the configuration object
 * (`Object.assign({}, config, parse(connectionString))`), and every query
 * parameter gets in there unfiltered, so `?statement_timeout=0` in the string
 * would lift the limit entirely (measured: the query is not canceled, `SHOW
 * statement_timeout` returns 0). The actual protection against that comes not from
 * checking the string but from the session `SET` when a connection is handed out
 * (see `client.ts`) — it runs after the session has started and overrides any
 * startup value.
 *
 * The check here is only needed for the warning and is therefore best-effort: the
 * parsing goes as a URL (that way a `%5F` in the parameter's name is decoded and
 * gets caught too), while for strings of another grammar (`host=… port=…`) a
 * substring search is what remains. The string is NOT rewritten in the process: the
 * driver has a grammar of its own — it can, for instance, recover the parsing of a
 * URL with no host — and any edit of ours would risk distorting the connection
 * while giving nothing beyond the `SET`.
 *
 * The vector through `options=-c statement_timeout=…` was checked separately and
 * needs no handling: a standalone startup parameter is applied after the
 * command-line options.
 *
 * @param connectionString - The connection string from the configuration.
 * @returns The string sets a limit of its own.
 */
function hasStatementTimeoutParam(connectionString: string): boolean {
    const PARAM_NAME = 'statement_timeout';

    try {
        return new URL(connectionString).searchParams.has(PARAM_NAME);
    } catch {
        return connectionString.includes(PARAM_NAME);
    }
}

/**
 * Assembles the pool configuration.
 *
 * `statement_timeout` goes out as a startup parameter of the connection, that is,
 * it applies to every query of any consumer of the pool (the storage adapter and
 * database-auth). The alternatives were rejected: the driver's `query_timeout` is a
 * client-side timer, under which the server-side query goes on executing
 * (measured), and a `SET` in the `pool.on('connect')` handler is unreliable —
 * `pg-pool` does not await the listener's promise, so the first query is able to
 * outrun the setting of the limit.
 *
 * The neighboring server-side limits are deliberately left unset: waiting for a
 * lock is already part of the statement's budget, and
 * `idle_in_transaction_session_timeout` does not cancel a query but tears the
 * session down — and it arrives as an asynchronous `error` event on the HANDED OUT
 * client, where the pool has no listener (`pool.on('error')` serves idle
 * connections only), meaning it would bring the process down.
 *
 * @param connectionString - The PostgreSQL connection string.
 * @param statementTimeoutRaw - The limit's value from runtimeConfig.
 * @returns The configuration for the pool's constructor.
 */
export function buildPostgresPoolConfig(
    connectionString: string,
    statementTimeoutRaw: unknown
): IPostgresPoolConfig {
    const statementTimeout = resolveStatementTimeoutMs(statementTimeoutRaw);

    if (hasStatementTimeoutParam(connectionString)) {
        console.warn(
            '[PostgreSQL] Remove "statement_timeout" from the connection string: the limit is ' +
                'owned by bricks.database.statementTimeoutMs ' +
                `(NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS), effective value is ${statementTimeout} ms. ` +
                'The value from the string still applies until the connection is initialized, ' +
                'so a tiny one can cancel that initialization and an invalid one can break the connection.'
        );
    }

    return {
        connectionString,
        max: POOL_MAX_CONNECTIONS,
        idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
        statement_timeout: statementTimeout,
    };
}
// #endregion
