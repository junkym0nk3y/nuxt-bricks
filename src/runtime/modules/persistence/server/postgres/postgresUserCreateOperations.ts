/**
 * The account creation operations of the Postgres adapter: the claim of a client's
 * Idempotency-Key, the write of the account under that claim, and giving a claim up.
 *
 * Why this half exists at all — the column comments of
 * `bricks_user_create_operations` in the base migration; why it is a file of its own
 * — `TAuthUserCreateOperationMethods` in `types/authAdapters.d.ts`.
 *
 * The protocol in one place, because the three methods only make sense together:
 *
 * 1. `claim` reserves the key BEFORE the password hash is computed and hands out an
 *    `attempt` — the fencing token of the claim.
 * 2. `createUserForOperation` writes the account and closes the operation in ONE
 *    transaction, and only while the claim is still the caller's (`attempt` matches).
 * 3. `release` gives an owned claim up when the attempt broke off before the write.
 *
 * The fencing token is what makes an expired lease safe to take over: the previous
 * owner may still be alive — waiting behind the derivation semaphore — and its write
 * must not land after the operation has been handed to somebody else.
 */
import { query, withTransaction, type TTransactionQuery } from './client';
import {
    USER_SUMMARY_COLUMNS,
    isPossibleUsernameConflict,
    toUserSummary,
} from './postgresAuthUserMethods';
import type { TAuthUserCreateOperationMethods } from '../../types/authAdapters';
import type {
    IAuthUserCreateClaimInput,
    IAuthUserCreateFinalizeInput,
    IAuthUserCreateReleaseInput,
    TAuthUserCreateClaim,
    TAuthUserCreateOutcome,
} from '../../types/authUserCreate';
import type { IBricksUserSummaryRow, IUserCreateOperationRow } from '../../types/postgres';

/** The columns of an operation the protocol reads */
const OPERATION_COLUMNS = `idempotency_key AS "idempotencyKey",
    request_fingerprint AS "requestFingerprint", state, attempt,
    created_user_id AS "createdUserId", rejection_code AS "rejectionCode"`;

/**
 * The claim of a key in ONE statement.
 *
 * `ON CONFLICT ... DO UPDATE ... WHERE` is what makes it atomic: two parallel repeats
 * of one intention race on a single INSERT, and PostgreSQL lets exactly one of them
 * through. A read-then-write pair in place of this would leave open the very window
 * the key exists to close — both requests would see "nothing yet" and both would go
 * on to compute a hash.
 *
 * The `WHERE` of the upsert is the takeover rule: a claim may be taken over only
 * while the operation is still `running`, its lease has run out, and the body is the
 * same one. An empty result therefore means "the row exists and is not mine" — and
 * the caller reads it to learn what exactly stands in the way.
 */
const CLAIM_OPERATION_SQL = `
    INSERT INTO bricks_user_create_operations
        (idempotency_key, request_fingerprint, state, attempt, lease_expires_at)
    VALUES ($1, $2, 'running', 1, NOW() + make_interval(secs => $3::double precision))
    ON CONFLICT (idempotency_key) DO UPDATE
        SET attempt = bricks_user_create_operations.attempt + 1,
            lease_expires_at = NOW() + make_interval(secs => $3::double precision)
        WHERE bricks_user_create_operations.state = 'running'
          AND bricks_user_create_operations.lease_expires_at <= NOW()
          AND bricks_user_create_operations.request_fingerprint = $2
    RETURNING ${OPERATION_COLUMNS}`;

/**
 * Reads an operation under a row lock — inside the transaction of the write, so that
 * the state it was checked in cannot change between the check and the INSERT.
 *
 * @param txQuery - A query inside an open transaction.
 * @param idempotencyKey - The client's key.
 * @returns The operation row, or null when the key is unknown.
 */
async function lockOperation(
    txQuery: TTransactionQuery,
    idempotencyKey: string
): Promise<IUserCreateOperationRow | null> {
    const rows = await txQuery<IUserCreateOperationRow>(
        `SELECT ${OPERATION_COLUMNS} FROM bricks_user_create_operations
         WHERE idempotency_key = $1
         FOR UPDATE`,
        [idempotencyKey]
    );

    return rows[0] ?? null;
}

/**
 * Reads the account an operation created.
 *
 * `null` while the operation is `completed` is a legitimate state rather than a
 * failure: the column is `ON DELETE SET NULL`, so an account deleted afterwards
 * leaves the operation as a tombstone — and a late repeat has to be told the account
 * is gone instead of creating it anew.
 *
 * @param userId - The account identifier out of the operation.
 * @returns The account, or null when it has been deleted.
 */
async function readCreatedUser(userId: number | null) {
    if (userId === null) {
        return null;
    }

    const rows = await query<IBricksUserSummaryRow>(
        `SELECT ${USER_SUMMARY_COLUMNS} FROM bricks_users WHERE id = $1`,
        [userId]
    );

    return rows[0] ? toUserSummary(rows[0]) : null;
}

/**
 * Reads the outcome of an operation the caller does NOT own.
 *
 * @param row - The operation row.
 * @param requestFingerprint - The digest of the body that arrived now.
 * @returns What the caller has to answer.
 */
async function describeForeignOperation(
    row: IUserCreateOperationRow,
    requestFingerprint: string
): Promise<TAuthUserCreateClaim> {
    // The mismatch comes first: the same key with a different body is a client-side
    // error, and answering it with the outcome of another operation would hand back a
    // result that belongs to a different request
    if (row.requestFingerprint !== requestFingerprint) {
        return { status: 'payloadMismatch' };
    }

    if (row.state === 'rejected') {
        return { status: 'rejected', code: row.rejectionCode ?? 'USERNAME_TAKEN' };
    }

    if (row.state === 'completed') {
        const user = await readCreatedUser(row.createdUserId);

        return user ? { status: 'completed', user } : { status: 'completedUserGone' };
    }

    return { status: 'running' };
}

/**
 * Creates the operation methods of the Postgres adapter.
 *
 * @returns The implementation of the account-creation protocol.
 */
export function createPostgresUserCreateOperations(): TAuthUserCreateOperationMethods {
    return {
        async claimUserCreateOperation(
            input: IAuthUserCreateClaimInput
        ): Promise<TAuthUserCreateClaim> {
            const claimed = await query<IUserCreateOperationRow>(CLAIM_OPERATION_SQL, [
                input.idempotencyKey,
                input.requestFingerprint,
                input.leaseMs / 1000,
            ]);

            if (claimed[0]) {
                return { status: 'claimed', attempt: claimed[0].attempt };
            }

            // The upsert refused: the row exists and is not the caller's. Reading it
            // is a second statement on purpose — the first one had to stay a single
            // atomic write, and by now the operation may have finished. Then this
            // answer is "completed" rather than "running", which is exactly what the
            // client needs
            const existing = await query<IUserCreateOperationRow>(
                `SELECT ${OPERATION_COLUMNS} FROM bricks_user_create_operations
                 WHERE idempotency_key = $1`,
                [input.idempotencyKey]
            );

            if (!existing[0]) {
                // The row disappeared between the two statements — impossible while
                // operations are kept indefinitely, and reported rather than guessed
                // if that ever changes
                throw new Error('User create operation vanished between claim and read');
            }

            return describeForeignOperation(existing[0], input.requestFingerprint);
        },

        async createUserForOperation(
            input: IAuthUserCreateFinalizeInput
        ): Promise<TAuthUserCreateOutcome> {
            return withTransaction(async (txQuery) => {
                const operation = await lockOperation(txQuery, input.idempotencyKey);

                // The claim is checked under the lock rather than trusted: while the
                // hash was being computed the lease could have run out and the
                // operation could have been taken over. Writing the account anyway
                // would create it under a claim that is no longer ours — the second
                // owner would create it too, and one of the two would stay unusable
                if (
                    !operation ||
                    operation.state !== 'running' ||
                    operation.attempt !== input.attempt
                ) {
                    return { status: 'staleClaim' };
                }

                // The INSERT stands behind a savepoint: a taken login aborts the
                // statement, and without the savepoint the whole transaction would be
                // dead — there would be nothing left to write the refusal into, and
                // the operation would stay `running` until its lease ran out
                await txQuery('SAVEPOINT bricks_user_insert');

                let created: IBricksUserSummaryRow | undefined;

                try {
                    const rows = await txQuery<IBricksUserSummaryRow>(
                        `INSERT INTO bricks_users
                            (username, password_hash, role, display_name, is_active)
                        VALUES (lower($1), $2, $3, $4, $5)
                        RETURNING ${USER_SUMMARY_COLUMNS}`,
                        [
                            input.payload.username,
                            input.payload.passwordHash,
                            input.payload.role,
                            input.payload.displayName,
                            input.payload.isActive,
                        ]
                    );

                    created = rows[0];
                } catch (error: unknown) {
                    if (!isPossibleUsernameConflict(error)) {
                        throw error;
                    }

                    await txQuery('ROLLBACK TO SAVEPOINT bricks_user_insert');

                    // The refusal is stored in the operation: a repeat replays it
                    // instead of computing a second hash for an outcome already known
                    await txQuery(
                        `UPDATE bricks_user_create_operations
                         SET state = 'rejected', rejection_code = $2, lease_expires_at = NULL
                         WHERE idempotency_key = $1`,
                        [input.idempotencyKey, 'USERNAME_TAKEN']
                    );

                    return { status: 'rejected', code: 'USERNAME_TAKEN' };
                }

                if (!created) {
                    throw new Error('Failed to create user');
                }

                await txQuery(
                    `UPDATE bricks_user_create_operations
                     SET state = 'completed', created_user_id = $2, lease_expires_at = NULL
                     WHERE idempotency_key = $1`,
                    [input.idempotencyKey, created.id]
                );

                return { status: 'created', user: toUserSummary(created) };
            });
        },

        async releaseUserCreateOperation(input: IAuthUserCreateReleaseInput): Promise<void> {
            // The lease is expired rather than the row deleted: the key must stay
            // bound to the digest of its body, so the same key arriving with a
            // different body is still recognized as a different request. The attempt
            // condition keeps a former owner from freeing a claim that has already
            // been taken over
            await query(
                `UPDATE bricks_user_create_operations
                 SET lease_expires_at = NOW()
                 WHERE idempotency_key = $1 AND attempt = $2 AND state = 'running'`,
                [input.idempotencyKey, input.attempt]
            );
        },
    };
}
