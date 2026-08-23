/**
 * The contract of the PostgreSQL pool configuration
 * (`server/postgres/poolConfig.ts`) and the shapes of the result rows the adapters
 * bring to the `types/adapters` contracts.
 *
 * The pool's shape is described by fields of its own rather than through the driver's
 * `PoolConfig`: `pg` is an optional peer dependency (external mode does not require
 * it), and the configuration's type must not drag its resolution along.
 */
import type { IBricksUserSummary, TBricksUserRole } from '../../common/types/auth';
import type { TAuthUserCreateRejection } from './authAdapters';

/**
 * An account row out of `bricks_users` before the dates are normalized: node-postgres
 * returns TIMESTAMPTZ columns as `Date`, while the contract requires an ISO string.
 */
export interface IBricksUserSummaryRow extends Omit<
    IBricksUserSummary,
    'createdAt' | 'lastLoginAt'
> {
    createdAt: string | Date;
    lastLoginAt: string | Date | null;
}

/**
 * A row of `bricks_user_create_operations` — the account creation operation
 * addressed by the client's Idempotency-Key.
 *
 * The dates are absent on purpose: the protocol compares the lease against `NOW()`
 * inside SQL, so no moment of it ever crosses into the application, and a `Date` that
 * nobody normalizes cannot leak into an answer.
 */
export interface IUserCreateOperationRow {
    idempotencyKey: string;
    requestFingerprint: string;
    state: 'running' | 'completed' | 'rejected';
    /** The fencing token of the current claim */
    attempt: number;
    /** The account the operation created; null — none yet, or it has been deleted */
    createdUserId: number | null;
    /** The stored reason of a terminal refusal */
    rejectionCode: TAuthUserCreateRejection | null;
}

/**
 * The account state the management's edge rules need (read under a `FOR UPDATE`
 * together with the set of active administrators).
 */
export interface IAuthUserStateRow {
    id: number;
    role: TBricksUserRole;
    isActive: boolean;
}

/**
 * The outcome of an account mutation under a lock on the set of active administrators.
 *
 * An edge rule's refusal is returned as a flag rather than as an exception from inside
 * the transaction: `withTransaction` logs any caught error as a transaction failure,
 * and a routine refusal ("the last administrator cannot be demoted") would go into the
 * log as a database failure. The error is created by the caller, outside the
 * transaction by then.
 */
export interface IGuardedUserMutation {
    isRefused: boolean;
    /**
     * The row's state after the mutation, and for a deletion — the one removed by it;
     * null — an edge rule's refusal, there is nothing to return.
     */
    user: IBricksUserSummary | null;
}

/** A row of the session's JOIN result with the user's fields (camelCase aliases). */
export interface IAuthSessionJoinRow {
    tokenHash: string;
    /** A TIMESTAMPTZ column: node-postgres returns a Date. */
    expiresAt: string | Date;
    lastUsedAt: string;
    userId: number;
    username: string;
    isActive: boolean;
    role: TBricksUserRole;
    /** The credentials generation: goes out as a condition of the profile's writes. */
    authVersion: number;
    displayName: string | null;
    avatarUrl: string | null;
    /**
     * The result of comparing the hash against the seed one: the account's password
     * is still the default.
     */
    isDefaultPassword: boolean;
}

/**
 * A `pg` driver error in the scope the adapter examines: the refusal's SQLSTATE code.
 *
 * A shape of its own rather than the driver's `DatabaseError`, for the same reason as
 * with the pool's configuration: `pg` is an optional peer dependency, and the type must
 * not drag its resolution along.
 */
export interface IPostgresErrorLike {
    /**
     * The refusal's SQLSTATE ('23505' unique_violation, '23503'
     * foreign_key_violation).
     */
    code?: unknown;
    /**
     * The violated constraint's name — several constraints of one table are told apart
     * by it.
     */
    constraint?: unknown;
}

export interface IPostgresPoolConfig {
    /** The PostgreSQL connection string. */
    connectionString: string;
    /** The cap on connections in the pool. */
    max: number;
    /** How long to hold an idle connection before closing it, ms. */
    idleTimeoutMillis: number;
    /** The ceiling on waiting for a free connection from the pool, ms. */
    connectionTimeoutMillis: number;
    /**
     * The server-side limit on executing ONE statement, ms: PostgreSQL cancels the
     * query itself and frees the connection.
     */
    statement_timeout: number;
}
