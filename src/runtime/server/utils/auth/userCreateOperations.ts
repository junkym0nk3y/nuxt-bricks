/**
 * The HTTP half of the account creation protocol: reading the client's operation key,
 * the digest of the request and the answers to a claim the caller does not own.
 *
 * Why the protocol exists at all — the column comments of
 * `bricks_user_create_operations` in the base migration. In short: computing the
 * password hash is deliberately slow, so the answer may fail to arrive within the
 * client's waiting ceiling while the account HAS been created, and from the list alone
 * the client cannot tell whether its own request went through. The key gives the
 * request a name, so a repeat asks about ITS operation instead of guessing by the
 * login.
 */
import { createError, getRequestHeader, type H3Event } from 'h3';
import { createHash } from 'node:crypto';
import {
    BRICKS_IDEMPOTENCY_KEY_HEADER,
    BRICKS_IDEMPOTENCY_KEY_PATTERN,
} from '../../../modules/common/constants/auth';
import { BRICKS_API_ERROR_CODES } from '../../../modules/common/constants/apiErrors';
import type { TAuthUserCreateClaim } from '../../../modules/persistence/types/authAdapters';
import type { IAuthUserCreateInput } from './types';

/**
 * How long a claim of an operation stays trusted.
 *
 * NOT the client's waiting ceiling (30 s): the ceiling says the client stopped
 * waiting, while the derivation may legitimately still be queued behind the shared
 * semaphore — a burst of account creations queues them one after another. The lease
 * only matters when the server-side attempt disappeared without a trace (the process
 * died), and until it runs out a repeat is answered "the first attempt is still
 * running" rather than being allowed to start a second one.
 *
 * Correctness does not rest on the value: the fencing token of the claim keeps a
 * former owner from writing after the operation has been taken over. Too short a
 * lease costs a wasted derivation, not a duplicated account.
 */
export const BRICKS_USER_CREATE_LEASE_MS = 120_000;

/**
 * How long the client is asked to wait before asking about a running operation
 * again, in seconds. Sized by the derivation: a queued scrypt takes single-digit
 * seconds, so a shorter interval would just burn requests on the same answer.
 */
const USER_CREATE_RETRY_AFTER_SECONDS = 5;

/**
 * Requires the operation key of the request.
 *
 * Mandatory rather than optional: an endpoint that also serves requests without a key
 * keeps the hole the key closes — a repeat with no key cannot be told from a second
 * creation. The project is unpublished and supports no backward compatibility, so the
 * demand costs nothing but has to be stated in the answer.
 *
 * @param event - Request event.
 * @returns The key as it arrived.
 */
export function requireUserCreateOperationKey(event: H3Event): string {
    const value = getRequestHeader(event, BRICKS_IDEMPOTENCY_KEY_HEADER);

    if (typeof value === 'string' && BRICKS_IDEMPOTENCY_KEY_PATTERN.test(value)) {
        return value;
    }

    throw createError({
        statusCode: 400,
        statusMessage: `Header "${BRICKS_IDEMPOTENCY_KEY_HEADER}" is required: 16 to 64 characters of A-Z a-z 0-9 _ -`,
        data: { code: BRICKS_API_ERROR_CODES.idempotencyKeyRequired },
    });
}

/**
 * The digest of the meaningful fields of a creation request — by it the same key
 * arriving with a DIFFERENT body is recognized.
 *
 * The fields go into a fixed ARRAY rather than an object: the digest must not depend
 * on the order the keys happen to be serialized in, and an array states the order
 * once and for all. Adding a field to the creation form means adding it here too —
 * otherwise two requests differing only by that field would count as one.
 *
 * The PASSWORD is deliberately absent. A plain digest including it would turn the
 * operations table into a fast offline oracle for guessing passwords out of a stolen
 * dump, and a keyed digest would demand a server secret in the module options — a
 * mandatory setting for every installation. The case it would catch does not arise in
 * the interface: the form keeps one key per intention and issues a new one on an edit
 * of any field, the password included, so a repeat carrying a different password is a
 * different key. A client that reuses a key with a different password is answered
 * with the outcome of the FIRST attempt; that limitation is the price of not having
 * the secret.
 *
 * @param input - The validated fields of the creation.
 * @returns The SHA-256 hex of the canonical form of the request.
 */
export function buildUserCreateFingerprint(input: IAuthUserCreateInput): string {
    const canonical = JSON.stringify([
        input.username,
        input.role,
        input.displayName,
        input.isActive,
    ]);

    return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Turns a claim the caller does not own into the answer of the endpoint.
 *
 * Every branch is a definite statement about the outcome of the FIRST attempt, and
 * that is the whole value of the key: before it the client could only report what it
 * could see in the list, which proved nothing.
 *
 * @param claim - The outcome of the claim, anything but `claimed`.
 * @param username - The login of the request, for the taken-login refusal.
 */
export function throwUserCreateClaimError(
    claim: Exclude<TAuthUserCreateClaim, { status: 'claimed' } | { status: 'completed' }>,
    username: string
): never {
    if (claim.status === 'payloadMismatch') {
        // 422 rather than 409: the request is well-formed and the state of the system
        // is not in the way — it is the pair "key + body" that contradicts itself, and
        // repeating it changes nothing
        throw createError({
            statusCode: 422,
            statusMessage: 'This operation key was used with a different request body',
            data: { code: BRICKS_API_ERROR_CODES.idempotencyKeyReused },
        });
    }

    if (claim.status === 'rejected') {
        // The stored refusal is replayed: the repeat gets the same answer the first
        // attempt got, and pays for no second derivation
        throw createError({
            statusCode: 409,
            statusMessage: 'Username is already taken',
            data: { code: BRICKS_API_ERROR_CODES.usernameTaken, username },
        });
    }

    if (claim.status === 'completedUserGone') {
        // 410 rather than 409: the outcome is final and the client must not retry —
        // this key already created an account, and that account has been deleted
        throw createError({
            statusCode: 410,
            statusMessage: 'The account this operation created no longer exists',
            data: { code: BRICKS_API_ERROR_CODES.userCreateResultGone },
        });
    }

    throw createError({
        statusCode: 409,
        statusMessage: 'The first attempt of this operation is still running',
        data: {
            code: BRICKS_API_ERROR_CODES.userCreateInProgress,
            retryAfterSeconds: USER_CREATE_RETRY_AFTER_SECONDS,
        },
    });
}
