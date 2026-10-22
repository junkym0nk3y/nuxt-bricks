/**
 * The types of the account creation protocol addressed by the client's key: the claim,
 * the fencing token and the lease.
 *
 * A file of its own rather than a part of `authAdapters.d.ts`, and for the same reason
 * `TAuthUserCreateOperationMethods` is a type of its own: this half owns a table and a
 * protocol that the plain row mutations know nothing about. The contract of the store
 * imports them back — the methods of the protocol live in `IAuthAdapter` alongside the
 * rest, because one implementation answers for all of it.
 */
import type { IBricksUserSummary, TBricksUserRole } from '../../common/types/auth';

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
