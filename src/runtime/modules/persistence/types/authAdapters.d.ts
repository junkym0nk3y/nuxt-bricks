/**
 * Persistence auth-layer contracts: database-auth users and their cookie sessions.
 *
 * Kept apart from `adapters.d.ts` not for style: that one holds the page and
 * media data contract, which can live in an EXTERNAL backend (see
 * docs/external-backend-contract.md), while this one holds accounts, which live
 * only in the built-in Postgres and are incompatible with an external backend by
 * build. Different consumers, different reasons to change; together the file
 * kept outgrowing the 500-line ceiling.
 */
import type { IBricksUserSummary, TBricksUserRole } from '../../common/types/auth';

/**
 * A database-auth user record (the password hash included — for verify only).
 */
export interface IAuthUserRecord {
    id: number;
    username: string;
    /** The self-describing format scrypt:N:r:p:saltB64:hashB64. */
    passwordHash: string;
    isActive: boolean;
    role: TBricksUserRole;
    /**
     * The credentials generation as of the read. Login must pass it into
     * `createSession`: verifying the password takes seconds (scrypt), and in that
     * time the account could have been deactivated or had its password changed.
     */
    authVersion: number;
}

/**
 * The user of an authorized session (no secrets — goes into event.context and to
 * the client).
 */
export interface IAuthSessionUser {
    id: number;
    username: string;
    isActive: boolean;
    /**
     * The current role, not a snapshot as of login: the handler guard reads it on
     * every request, so a demotion takes effect from the next request without
     * waiting for the cookie to expire.
     */
    role: TBricksUserRole;
    /**
     * The credentials generation as of resolving the session. Needed by the
     * writes that run NOTICEABLY later than the session check (a profile edit, a
     * photo upload through sharp and storage): they are conditional on this
     * value, otherwise they would land with credentials already revoked.
     *
     * Never handed outward: the response projections (`toAuthProfileUser`) drop
     * it, and only the role makes it into the client payload.
     */
    authVersion: number;
    /** The profile's display name; null — the username is shown. */
    displayName: string | null;
    /** A link to the profile photo; null — the letter placeholder. */
    avatarUrl: string | null;
    /**
     * The account's password is still the one the migration seed set (`admin` /
     * `bricks-pass`). The interface asks for a change on this flag: the seed is
     * the same across every installation and is published in the README, meaning
     * that until the password is changed the account is protected by exactly
     * nothing.
     *
     * Computed by comparing the hash string against a constant rather than by
     * verifying the password: scrypt on every session resolve would cost hundreds
     * of milliseconds, and the hash is changed by any password change — one's
     * own, an administrator's, or an edit in the database.
     */
    isDefaultPassword: boolean;
}

/**
 * A session together with its user (JOIN bricks_sessions × bricks_users).
 */
export interface IAuthSessionWithUser {
    tokenHash: string;
    expiresAt: string;
    lastUsedAt: string;
    user: IAuthSessionUser;
}

/**
 * Data for an administrator creating an account. The password hash is computed
 * by the handler (`server/utils/auth/passwords.ts`) — the adapter never sees
 * plaintext passwords at all, so it can neither log them nor send them outward.
 *
 * The display name and the activity flag are mandatory and have already been
 * decided by the caller, even though both are optional in the creation form: the
 * adapter substitutes values into the INSERT positionally, and `undefined` would
 * reach the column as NULL — which for `is_active NOT NULL` is a rejected insert,
 * not "take the table default". The decision about "what was not sent" is made by
 * the handler, which has the request context.
 */
export interface ICreateAuthUserPayload {
    username: string;
    passwordHash: string;
    role: TBricksUserRole;
    /** The display name; null — the username is shown everywhere. */
    displayName: string | null;
    /**
     * Whether the account can log in right away. `false` — created ahead of time:
     * login is refused until an administrator enables it.
     */
    isActive: boolean;
}

/**
 * The claim of an account creation operation addressed by the client's key.
 *
 * The key is claimed BEFORE the password hash is computed, and that order is the
 * whole point: the derivation is slow and runs under the process-wide semaphore, so
 * a repeat sent during the first attempt must be recognized before it starts paying
 * for a second one.
 */
export interface IAuthUserCreateClaimInput {
    /** The key the client generated and sent with its very first request */
    idempotencyKey: string;
    /**
     * The digest of the request's meaningful fields. It answers "the same key with a
     * different body" — such a request must be refused rather than served with the
     * result of another operation. The password is not part of it (see the column
     * comment in the base migration).
     */
    requestFingerprint: string;
    /**
     * How long the claim stays trusted. NOT the client's waiting ceiling: the
     * ceiling says the client stopped waiting, while the derivation may legitimately
     * still be queued. An expired claim may be taken over — the fencing token keeps
     * the previous owner from writing afterwards.
     */
    leaseMs: number;
}

/**
 * The reasons an attempt is refused for good — a repeat would run into the same one,
 * so the refusal is stored and replayed instead of paying for a second derivation.
 */
export type TAuthUserCreateRejection = 'USERNAME_TAKEN';

/**
 * The outcome of a claim.
 *
 * `claimed` — the caller owns the operation and must finish it with
 * `createUserForOperation`, passing `attempt` back.
 * `running` — somebody else owns it and the lease is alive; the answer of the first
 * attempt is not known yet.
 * `completed` — the operation already created this account; the caller answers with
 * it and creates nothing.
 * `completedUserGone` — the operation created an account, and that account has since
 * been deleted. Creating it anew under the same key is exactly what the key
 * forbids.
 * `rejected` — the first attempt was refused for good; the refusal is replayed.
 * `payloadMismatch` — the key is known but the body differs.
 */
export type TAuthUserCreateClaim =
    | { status: 'claimed'; attempt: number }
    | { status: 'running' }
    | { status: 'completed'; user: IBricksUserSummary }
    | { status: 'completedUserGone' }
    | { status: 'rejected'; code: TAuthUserCreateRejection }
    | { status: 'payloadMismatch' };

/**
 * The write of an account under an owned claim: the payload plus the claim it was
 * issued under.
 */
export interface IAuthUserCreateFinalizeInput {
    idempotencyKey: string;
    /** The number `claimUserCreateOperation` returned; the write is conditional on it */
    attempt: number;
    payload: ICreateAuthUserPayload;
}

/**
 * The outcome of the write.
 *
 * `created` — the account exists and the operation is closed by it.
 * `rejected` — the write was refused for good, and the operation carries that
 * refusal now.
 * `staleClaim` — the claim was taken over while the hash was being computed (the
 * lease had expired). Nothing was written: the account belongs to whoever holds the
 * claim now.
 */
export type TAuthUserCreateOutcome =
    | { status: 'created'; user: IBricksUserSummary }
    | { status: 'rejected'; code: TAuthUserCreateRejection }
    | { status: 'staleClaim' };

/**
 * Giving up an owned claim without a write — the attempt broke off before the
 * account could be created (the derivation queue overflowed, for one).
 */
export interface IAuthUserCreateReleaseInput {
    idempotencyKey: string;
    attempt: number;
}

/**
 * An edit to somebody else's account state: role and/or activity. `undefined` —
 * the field was not passed and keeps its current value.
 *
 * Both fields in one contract rather than in two methods, because they must be
 * applied in a single transaction: split them into a pair of calls
 * and a failure of the second would leave the row in a state the client never
 * asked for, without telling which half went through. It also lets the edge rule
 * about the last administrator be checked against the RESULTING state rather
 * than against each field on its own.
 *
 * The profile name and photo are deliberately absent here: those are edited by
 * the person themselves, and an administrator only has access to rights,
 * activity, the password and deletion. The username cannot be changed at all —
 * a rename would break links to an author and the journals.
 */
export interface IAuthUserStateChange {
    role?: TBricksUserRole;
    isActive?: boolean;
}

/**
 * An edit to ONE'S OWN profile: the display name and/or the photo link.
 * `undefined` — the field was not passed and keeps its current value, `null` —
 * clear the value (the username and the letter placeholder are shown).
 *
 * The photo link only ever arrives here from the avatar handlers, which uploaded
 * that file themselves: accept it from the client and the column would hold an
 * arbitrary external address — that is, somebody else's resource loading in the
 * corner of the builder for everyone who sees this account.
 *
 * There is no role or activity here: one's own rights are not changed behind a
 * second administrator's back. Nor a username — it cannot be changed at all.
 */
export interface IAuthUserProfileChange {
    displayName?: string | null;
    avatarUrl?: string | null;
}

/**
 * The outcome of a profile edit: the row's new state and the photo link as it was
 * BEFORE the edit.
 *
 * The caller needs the previous link to remove the orphaned file, and the same
 * transaction that writes the new one must read it: read it earlier and
 * two uploads in a row would leave a file in storage nobody references any more.
 */
export interface IAuthProfileUpdateResult {
    user: IBricksUserSummary;
    previousAvatarUrl: string | null;
}

/**
 * Changing ONE'S OWN password: the new hash and the credentials generation read
 * before verifying the current password.
 */
export interface IAuthOwnPasswordChange {
    passwordHash: string;
    /**
     * The generation as of reading the account. Verifying the current password
     * takes seconds (scrypt), and in that time the account could have been
     * deactivated or had its password reset — the write must be
     * conditional.
     */
    expectedAuthVersion: number;
}

/**
 * The account state the edge rules (`server/utils/authUserRules.ts`) depend on:
 * role and activity. Read under a row lock and compared with the resulting state.
 */
export interface IAuthUserStateSnapshot {
    role: TBricksUserRole;
    isActive: boolean;
}

/**
 * Data for creating a cookie session (only the token's SHA-256 is stored in the
 * database).
 */
export interface ICreateAuthSessionPayload {
    tokenHash: string;
    userId: number;
    expiresAt: Date;
    /**
     * The credentials generation read BEFORE verifying the password. A session is
     * created only if it is still current and the account is active.
     */
    expectedAuthVersion: number;
}

/**
 * Storage of database-auth users and cookie sessions (Postgres by default).
 *
 * A freshness requirement mandatory for any implementation (an external one
 * included — an HTTP backend, OIDC): `getSessionWithUser` must return
 * the CURRENT `role`, `isActive` and profile rather than a snapshot as of login,
 * and must treat the session as absent when the credentials generation
 * has diverged from the one stored at login. Revocation of rights rests on this:
 * a password change, a deactivation and a role change take effect from the next
 * request rather than after the cookie's seven days of life. An implementation
 * that caches the role or carries it in a self-signed token without a check
 * violates the contract.
 */
export interface IAuthAdapter {
    getUserByUsername(username: string): Promise<IAuthUserRecord | null>;
    /**
     * Returns only an unexpired session of an active user with a current
     * credentials generation (everything else is indistinguishable from an
     * absent session).
     */
    getSessionWithUser(tokenHash: string): Promise<IAuthSessionWithUser | null>;
    /**
     * Creates a session if the account is still active and its generation
     * matches `expectedAuthVersion`, and marks the moment of login
     * (`lastLoginAt`).
     *
     * Both writes must be applied together and under one condition:
     * marking the login before the session insert succeeds would record a login
     * that never happened, and a separate write after it could be lost. The
     * credentials generation does not move in the process — logging in does not
     * revoke rights.
     *
     * @returns false — the account state changed between the password check and
     * the insert (the password was changed, the account deactivated, the role
     * changed); the cookie must not be set in that case.
     */
    createSession(payload: ICreateAuthSessionPayload): Promise<boolean>;
    deleteSession(tokenHash: string): Promise<void>;
    /** Deletes expired sessions; returns how many were deleted. */
    deleteExpiredSessions(): Promise<number>;
    /** Sliding extension: updates expires_at and last_used_at. */
    touchSession(tokenHash: string, expiresAt: Date): Promise<void>;
    /** Every account for the management section, in a stable order (by id). */
    listUsers(): Promise<IBricksUserSummary[]>;
    /**
     * Claims an account creation operation by the client's key — the step that has to
     * happen BEFORE the password hash is computed.
     *
     * A TERMINAL operation (created an account or was refused for good) is kept
     * INDEFINITELY. Any cleanup of those rows returns the defect the key closes: a
     * repeat arriving after the row was deleted would create a second account. Should
     * the volume ever have to be bounded, that is a deliberate weakening of the
     * guarantee and belongs in the documentation of the installation, not in a silent
     * job.
     *
     * The claim is obliged to be atomic: two parallel repeats of one intention must
     * settle so that exactly one of them owns the operation, while the other is told
     * what the first one is doing. An implementation that reads and then writes
     * leaves the window this key exists to close.
     *
     * @param input - The key, the digest of the body and the lease of the claim.
     */
    claimUserCreateOperation(input: IAuthUserCreateClaimInput): Promise<TAuthUserCreateClaim>;
    /**
     * Creates the account of an owned claim and closes the operation by it.
     *
     * Both writes are obliged to be applied TOGETHER: an implementation that inserts
     * the account and then marks the operation in a second step reintroduces the
     * very defect the key closes — a process dying between the two leaves an account
     * nobody can connect to the request, and the operation stuck as running.
     *
     * A refusal a repeat would run into again (a taken login) has to be stored in
     * the operation, so the repeat replays it instead of paying for a second
     * derivation.
     *
     * @param input - The key, the claim number and the account payload.
     */
    createUserForOperation(input: IAuthUserCreateFinalizeInput): Promise<TAuthUserCreateOutcome>;
    /**
     * Gives up an owned claim without a write, so a repeat may take the operation
     * over at once instead of waiting out the lease.
     *
     * The row is KEPT rather than deleted: the key stays bound to the digest of its
     * body, so the same key arriving with a different body is still recognized as a
     * different request.
     *
     * @param input - The key and the claim number.
     */
    releaseUserCreateOperation(input: IAuthUserCreateReleaseInput): Promise<void>;
    /**
     * Changes the account's role and/or activity in a single transaction and
     * revokes its sessions: otherwise a stolen cookie would gain the new powers
     * on a promotion, and a demotion would only take effect from the next login.
     * An edit that does not change the state does not tear down the sessions.
     *
     * @returns The row's new state; null — no such account.
     * @throws BricksLastActiveAdminError - The resulting state would leave the
     * system without an active administrator.
     */
    updateUserState(
        userId: number,
        change: IAuthUserStateChange
    ): Promise<IBricksUserSummary | null>;
    /**
     * Sets a new password hash and revokes the account's sessions.
     *
     * @returns The row's state; null — no such account.
     */
    updateUserPassword(userId: number, passwordHash: string): Promise<IBricksUserSummary | null>;
    /**
     * Edits the display name and/or the photo link of one's own profile.
     *
     * The generation is NOT raised and the sessions are NOT torn down: a name and
     * a photo are not credentials, and a person who renamed themselves would find
     * themselves thrown out of their own session. The account row is locked until
     * the previous photo link has been read, though — otherwise two simultaneous
     * avatar uploads would both take the same file for the previous one, and one
     * of the uploaded files would stay in storage forever.
     *
     * The write must be conditional on `expectedAuthVersion` and on
     * activity: time passes between resolving the session and this call (seconds,
     * for a photo upload), and during it the account could have been deactivated
     * or had its password reset.
     *
     * @param expectedAuthVersion - The generation read when the session was
     * resolved.
     * @returns The new state and the previous photo link; null — there is no live
     * account with this generation (deleted, deactivated, or the credentials were
     * revoked).
     */
    updateUserProfile(
        userId: number,
        change: IAuthUserProfileChange,
        expectedAuthVersion: number
    ): Promise<IAuthProfileUpdateResult | null>;
    /**
     * Sets a new password hash if the account is still active and its generation
     * matches the one read before verifying the current password, and revokes
     * every session of it (the one the request came from included).
     *
     * The condition is mandatory: verifying the current password takes seconds,
     * and in that time an administrator could have reset this account's password
     * to take it away from whoever knows the old one. An unconditional write
     * would undo that reset — with that very old password.
     *
     * @returns false — there is no such account, it is deactivated, or the
     * generation has moved.
     */
    updateOwnPassword(userId: number, change: IAuthOwnPasswordChange): Promise<boolean>;
    /**
     * Deletes an account (the sessions go with it through the FK cascade).
     *
     * @returns The deleted row; null — no such account. The row rather than a
     * success flag: the caller needs its `avatarUrl` to remove the photo file,
     * and reading it in a separate request before the deletion would mean
     * deleting the wrong file if the account managed to change its photo.
     * @throws BricksLastActiveAdminError - The deletion would leave the system
     * without an active administrator.
     */
    deleteUser(userId: number): Promise<IBricksUserSummary | null>;
}

/**
 * The account creation operations addressed by the client's key. A part of its own
 * rather than of `TAuthUserMethods`: this half owns a table and a protocol (a claim,
 * a fencing token, a lease) that the plain row mutations know nothing about.
 */
export type TAuthUserCreateOperationMethods = Pick<
    IAuthAdapter,
    'claimUserCreateOperation' | 'createUserForOperation' | 'releaseUserCreateOperation'
>;

/**
 * The mutating half of the account contract: everything that changes a
 * `bricks_users` row.
 *
 * The Postgres implementation assembles it in a file of its own and mixes it into the
 * adapter with a spread — the same arrangement as `TStorageMediaMethods`, and split
 * off for the same reason plus one of its own: these mutations carry edge rules and
 * row locks that session reads have no use for.
 */
export type TAuthUserMethods = Pick<
    IAuthAdapter,
    | 'listUsers'
    | 'updateUserState'
    | 'updateUserPassword'
    | 'updateUserProfile'
    | 'updateOwnPassword'
    | 'deleteUser'
>;
