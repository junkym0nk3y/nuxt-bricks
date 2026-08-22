/**
 * Hashing and verification of database-auth passwords: scrypt from node:crypto
 * (zero dependencies), a self-describing hash format.
 *
 * The format is `scrypt:N:r:p:saltB64:hashB64` — verify parses the parameters
 * out of the string, so changing the defaults does not break existing hashes.
 * The seed literal of the migration (the `admin` account of a fresh database) is
 * written in that same format.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** CPU/memory cost parameter (2^14) */
const SCRYPT_N = 16384;
/** Block size */
const SCRYPT_R = 8;
/** Parallelization */
const SCRYPT_P = 1;
/** Derived key length in bytes */
const SCRYPT_KEYLEN = 64;
/** Salt length in bytes */
const SALT_BYTES = 16;

/**
 * A valid scrypt hash of a password that does not exist — verifying against it
 * when the username is unknown equalizes response timing (anti-enumeration).
 */
export const DUMMY_PASSWORD_HASH =
    'scrypt:16384:8:1:2TrXt4LM6wHYsT2gslc3yg==:5gQCTq5qTZCoxPmV39EzZVKzvLSLkEH68C95sTHMEqK/QXjZox7YxDECgGg0pxq4mV53+EzscJx2B9f/CBxRWw==';

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
    });

    return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

/**
 * Hash parameters parsed out of the self-describing string.
 */
interface IParsedPasswordHash {
    n: number;
    r: number;
    p: number;
    salt: Buffer;
    hash: Buffer;
}

/**
 * Parses the hash string; null when the format is not recognized.
 */
function parsePasswordHash(storedHash: string): IParsedPasswordHash | null {
    const parts = storedHash.split(':');

    if (parts.length !== 6 || parts[0] !== 'scrypt') {
        return null;
    }

    const n = Number.parseInt(parts[1], 10);
    const r = Number.parseInt(parts[2], 10);
    const p = Number.parseInt(parts[3], 10);

    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
        return null;
    }

    const salt = Buffer.from(parts[4], 'base64');
    const hash = Buffer.from(parts[5], 'base64');

    if (salt.length === 0 || hash.length === 0) {
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
        });

        return timingSafeEqual(candidate, parsed.hash);
    } catch {
        // Invalid scrypt parameters (for example, N is not a power of two)
        return false;
    }
}
