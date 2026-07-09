#!/usr/bin/env node
/**
 * CLI генерации scrypt-хеша пароля для database-auth (bricks.auth.mode = 'database').
 *
 * Использование:
 *   npm run bricks:hash -- <password> [--username <name>]
 *   npx bricks-hash-password                 # пароль запрашивается интерактивно
 *
 * Печатает хеш в самоописывающем формате `scrypt:N:r:p:saltB64:hashB64` и
 * готовый INSERT в таблицу bricks_users. Параметры scrypt продублированы
 * с runtime/server/utils/auth/passwords.ts — контракт только формат строки:
 * verify парсит параметры из самого хеша.
 */
import { randomBytes, scrypt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

// Параметры scrypt (зеркалят runtime/server/utils/auth/passwords.ts)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * Хеширует пароль в формат scrypt:N:r:p:saltB64:hashB64.
 *
 * @param {string} password Пароль в открытом виде.
 * @returns {Promise<string>} Строка хеша.
 */
function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = randomBytes(SALT_BYTES);
        scrypt(
            password,
            salt,
            SCRYPT_KEYLEN,
            { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
            (error, hash) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(
                    `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('base64')}:${hash.toString('base64')}`
                );
            }
        );
    });
}

/**
 * Разбирает argv: первый позиционный аргумент — пароль, --username <name> — логин.
 *
 * @param {string[]} argv Аргументы после имени скрипта.
 * @returns {{ password: string | null, username: string }} Разобранные значения.
 */
function parseArgs(argv) {
    let password = null;
    let username = 'admin';

    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--username') {
            username = argv[index + 1] ?? username;
            index += 1;
            continue;
        }

        if (password === null && !argv[index].startsWith('--')) {
            password = argv[index];
        }
    }

    return { password, username };
}

/**
 * Запрашивает пароль интерактивно, если он не передан аргументом.
 *
 * @returns {Promise<string>} Введённый пароль.
 */
async function promptPassword() {
    const readline = createInterface({ input: process.stdin, output: process.stdout });

    try {
        return await readline.question('Password: ');
    } finally {
        readline.close();
    }
}

const { password: passwordArg, username } = parseArgs(process.argv.slice(2));
const password = passwordArg ?? (await promptPassword());

if (!password) {
    console.error('Password must not be empty');
    process.exit(1);
}

const hash = await hashPassword(password);
// Одинарные кавычки в SQL-литерале экранируются удвоением
const escapedUsername = username.replaceAll("'", "''");
const escapedHash = hash.replaceAll("'", "''");

console.log('Password hash:');
console.log(hash);
console.log('');
console.log('SQL:');
console.log(
    `INSERT INTO bricks_users (username, password_hash) VALUES ('${escapedUsername}', '${escapedHash}');`
);
