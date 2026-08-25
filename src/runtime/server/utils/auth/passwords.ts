/**
 * Hashing and verification of database-auth passwords: scrypt from node:crypto
 * (zero dependencies), a self-describing hash format.
 *
 * The format is `scrypt:N:r:p:saltB64:hashB64` — verify parses the parameters
 * out of the string, so changing the defaults does not break existing hashes.
 * The seed literal of the migration (the `admin` account of a fresh database) is
 * written in that same format.
 *
 * The parameters are the OWASP minimum in the shape that keeps the memory of one
 * derivation small: `N=2^14, r=8, p=5` costs the same work as `N=2^17, r=8, p=1` but
 * asks OpenSSL for 16 MiB instead of 128, because `p` multiplies the time and not the
 * table. That matters twice over — the module is installed on instances nobody
 * measured, and the semaphore runs several derivations at once, so the 128 MiB variant
 * would have meant half a gigabyte of peak RSS on logins alone. Measured with
 * `scripts/benchmark-scrypt.mjs`.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { IParsedPasswordHash } from './types';

/** CPU/memory cost parameter (2^14) */
const SCRYPT_N = 16384;
/** Block size */
const SCRYPT_R = 8;
/** Parallelization: the work of the OWASP minimum, at the memory of 2^14 */
const SCRYPT_P = 5;
/** Derived key length in bytes */
const SCRYPT_KEYLEN = 64;
/** Salt length in bytes */
const SALT_BYTES = 16;
/**
 * Memory ceiling of one derivation. It is passed EXPLICITLY, although it repeats the
 * default of node: a stored string chooses the parameters of its own verification, so
 * the ceiling is what stands between a hostile row and an allocation of any size.
 * Raising it means recounting the peak RSS together with the concurrency of
 * `scryptGate` — 4 derivations of 128 MiB are half a gigabyte on logins alone.
 *
 * Memory only. The CPU cost of a string is bounded separately by `SCRYPT_MAX_WORK`:
 * `p` multiplies the time without touching the memory table, so it is invisible to
 * this ceiling.
 */
const SCRYPT_MAXMEM = 32 * 1024 * 1024;
/**
 * Work ceiling of a stored string: sixteen times the work of the current profile
 * (`N·r·p`).
 *
 * `maxmem` does not cover this. Node checks the ceiling against roughly `128·N·r` —
 * the memory table — and `p` is not part of it, so a row of legal memory and an absurd
 * `p` would keep both slots of the semaphore busy for as long as it liked and answer
 * 503 to everyone else. The store is trusted here only as far as the row itself: an
 * external adapter, a restored dump or a hand-edited column all end up in this
 * function.
 *
 * Sixteen times rather than exactly the current profile: verify has to keep accepting
 * the rows the package wrote before, and to survive one or two deliberate raises of
 * the defaults without a release that cannot read its own data. A raise beyond that
 * moves this number too — together with the concurrency of `scryptGate`.
 */
const SCRYPT_MAX_WORK = SCRYPT_N * SCRYPT_R * SCRYPT_P * 16;

/**
 * A valid scrypt hash of a password that does not exist — verifying against it
 * when the username is unknown equalizes response timing (anti-enumeration).
 *
 * It is written with the CURRENT parameters on purpose. A dummy left behind the
 * defaults breaks the equalization the other way round: the answer about a username
 * that does not exist would come back noticeably faster than the answer about one
 * that does.
 */
export const DUMMY_PASSWORD_HASH =
    'scrypt:16384:8:5:k5mYRrw278dm+hlVSwtxUw==:VHI69zwGGn007DUaTe2VcoCDvnxn82XuSWnpFQfSQhcPck9gXGxViVrKWXXhZ4FCo2Cj0HynXu4ryFFBlVN7GA==';

/**
 * Promisified scrypt.
 */
function deriveKey(
    password: string,
    salt: Buffer,
    keylen: number,
    options: ScryptOptions
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, keylen, options, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(derivedKey);
        });
    });
}

/**
 * Hashes a password into the self-describing scrypt:N:r:p:saltB64:hashB64 format.
 *
 * @param password - The plaintext password.
 * @returns The hash string for the bricks_users.password_hash column.
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const hash = await deriveKey(password, salt, SCRYPT_KEYLEN, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAXMEM,
    });

    return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

/**
 * Reads a decimal parameter of the hash string.
 *
 * `Number.parseInt` is not enough: it takes `16384junk` for 16384, that is a string
 * whose parameters do not say what they look like would still be accepted. A
 * positive whole number and nothing else.
 *
 * @param value - The field of the hash string.
 * @returns The number, or null when the field is not one.
 */
function parsePositiveInteger(value: string): number | null {
    if (!/^[1-9][0-9]*$/.test(value)) {
        return null;
    }

    const parsed = Number(value);

    return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Parses the hash string; null when the format is not recognized.
 */
function parsePasswordHash(storedHash: string): IParsedPasswordHash | null {
    const parts = storedHash.split(':');

    if (parts.length !== 6 || parts[0] !== 'scrypt') {
        return null;
    }

    const n = parsePositiveInteger(parts[1]);
    const r = parsePositiveInteger(parts[2]);
    const p = parsePositiveInteger(parts[3]);

    if (n === null || r === null || p === null) {
        return null;
    }

    const salt = Buffer.from(parts[4], 'base64');
    const hash = Buffer.from(parts[5], 'base64');

    if (salt.length === 0 || hash.length === 0) {
        return null;
    }

    // Stepwise rather than one product: the factors are only known to be safe
    // integers, and `n * r * p` of three huge ones would lose precision before the
    // comparison ever ran
    if (n > SCRYPT_MAX_WORK || r > SCRYPT_MAX_WORK || p > SCRYPT_MAX_WORK) {
        return null;
    }

    if (n * r > SCRYPT_MAX_WORK || n * r * p > SCRYPT_MAX_WORK) {
        return null;
    }

    return { n, r, p, salt, hash };
}

/**
 * Verifies a password against a hash in the self-describing format.
 * A malformed hash string yields false, not an exception.
 *
 * @param password - The plaintext password.
 * @param storedHash - The scrypt:N:r:p:saltB64:hashB64 string from the database.
 * @returns true — the password matches.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const parsed = parsePasswordHash(storedHash);

    if (!parsed) {
        return false;
    }

    try {
        const candidate = await deriveKey(password, parsed.salt, parsed.hash.length, {
            N: parsed.n,
            r: parsed.r,
            p: parsed.p,
            maxmem: SCRYPT_MAXMEM,
        });

        return timingSafeEqual(candidate, parsed.hash);
    } catch {
        // Invalid scrypt parameters (N is not a power of two, or the string asks for
        // more memory than the ceiling allows): an unreadable hash is a hash nothing
        // matches, and the answer stays the ordinary "wrong password"
        return false;
    }
}

/**
 * Tells whether a stored hash is weaker than what is written today, that is whether
 * it is worth rehashing after a successful sign-in.
 *
 * The comparison is a DOMINANCE one rather than "the parameters differ" or "N is
 * lower", and both simpler rules are wrong. `N` alone misses the case this check
 * exists for: the previous default was `N=2^14, p=1` — the same `N` as now, five
 * times less work. "Any difference" is worse still: it would rehash a hash written
 * with STRONGER parameters (`N=2^17, p=1`) down to the current ones, that is weaken
 * the row while looking like maintenance.
 *
 * @param storedHash - The hash string from the store.
 * @returns true — the current parameters are at least as costly in memory and
 * strictly more costly in work.
 */
export function needsPasswordRehash(storedHash: string): boolean {
    const parsed = parsePasswordHash(storedHash);

    if (!parsed) {
        return false;
    }

    const storedMemory = parsed.n * parsed.r;
    const currentMemory = SCRYPT_N * SCRYPT_R;
    const storedWork = storedMemory * parsed.p;
    const currentWork = currentMemory * SCRYPT_P;

    return currentMemory >= storedMemory && currentWork > storedWork;
}
