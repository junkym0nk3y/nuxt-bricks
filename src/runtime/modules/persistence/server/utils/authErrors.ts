/**
 * The auth layer's domain errors (the database-auth accounts).
 *
 * Kept apart from `storageErrors.ts`: that one holds the pages' and media's errors —
 * the `IStorageAdapter` contract, which can live in an external backend; this one holds
 * the `IAuthAdapter` contract, which has implementations and edge rules of its own.
 * The handlers map these classes onto HTTP statuses with a machine-readable `data.code`
 * (`toUsersHttpError` in handlerHelpers; the codes are `BRICKS_API_ERROR_CODES`).
 */

/**
 * The mutation would leave the system without an active administrator.
 *
 * The refusal is DECIDED inside the adapter's transaction, where the set of active
 * admins is already locked (`FOR UPDATE`): without the lock two simultaneous demotions
 * would read the same "there are two admins" and both would go through — a write skew
 * READ COMMITTED does not catch. Checking this in the handler, before the adapter's
 * call, is therefore not possible.
 *
 * The error itself, though, is CREATED after leaving the transaction (from inside, the
 * refusal is returned as a flag): `withTransaction` logs any caught error as a
 * transaction failure, and a routine refusal would go into the log as a database
 * failure. Moving the `throw` inside the callback will bring those false entries back.
 */
export class BricksLastActiveAdminError extends Error {
    constructor() {
        super('Cannot leave the system without an active administrator');
        this.name = 'BricksLastActiveAdminError';
    }
}

/**
 * The username is taken. The comparison is case-insensitive — as it is at login, so
 * `Admin` conflicts with an existing `admin`. Thrown on a violation of the
 * `lower(username)` unique index rather than on a check up front: a parallel creation
 * has time to slip in between the read and the insert.
 */
export class BricksUsernameTakenError extends Error {
    readonly username: string;

    constructor(username: string, cause?: unknown) {
        super('User with this username already exists', { cause });
        this.name = 'BricksUsernameTakenError';
        this.username = username;
    }
}
