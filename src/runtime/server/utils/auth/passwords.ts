/**
 * Хеширование и проверка паролей database-auth: scrypt из node:crypto
 * (ноль зависимостей), самоописывающий формат хеша.
 *
 * Формат: `scrypt:N:r:p:saltB64:hashB64` — verify парсит параметры из строки,
 * поэтому смена дефолтов не ломает существующие хеши. Тот же формат генерирует
 * CLI `src/cli/bricks-hash-password.mjs`.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** Стоимостной параметр CPU/memory (2^14). */
const SCRYPT_N = 16384;
/** Размер блока. */
const SCRYPT_R = 8;
/** Параллелизм. */
const SCRYPT_P = 1;
/** Длина производного ключа в байтах. */
const SCRYPT_KEYLEN = 64;
/** Длина соли в байтах. */
const SALT_BYTES = 16;

/**
 * Валидный scrypt-хеш несуществующего пароля — verify против него при
 * неизвестном username выравнивает тайминг ответа (анти-enumeration).
 */
export const DUMMY_PASSWORD_HASH =
    'scrypt:16384:8:1:2TrXt4LM6wHYsT2gslc3yg==:5gQCTq5qTZCoxPmV39EzZVKzvLSLkEH68C95sTHMEqK/QXjZox7YxDECgGg0pxq4mV53+EzscJx2B9f/CBxRWw==';

/**
 * Промисифицированный scrypt.
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
 * Хеширует пароль в самоописывающий формат scrypt:N:r:p:saltB64:hashB64.
 *
 * @param password - Пароль в открытом виде.
 * @returns Строка хеша для колонки bricks_users.password_hash.
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
 * Разобранные параметры хеша из самоописывающей строки.
 */
interface IParsedPasswordHash {
    n: number;
    r: number;
    p: number;
    salt: Buffer;
    hash: Buffer;
}

/**
 * Парсит строку хеша; null — если формат не распознан.
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
 * Проверяет пароль против хеша в самоописывающем формате.
 * Malformed-строка хеша → false (без исключения).
 *
 * @param password - Пароль в открытом виде.
 * @param storedHash - Строка scrypt:N:r:p:saltB64:hashB64 из БД.
 * @returns true — если пароль совпадает.
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
        // Невалидные scrypt-параметры (например, N не степень двойки)
        return false;
    }
}
