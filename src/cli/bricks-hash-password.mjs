#!/usr/bin/env node
/**
 * CLI генерации scrypt-хеша пароля для database-auth (bricks.auth.mode = 'database').
 *
 * Использование:
 *   npm run bricks:hash -- --username <name> [--role admin|editor|viewer]
 *   npx bricks-hash-password                 # пароль запрашивается интерактивно
 *
 * Пароль принимается только из интерактивного ввода или со stdin
 * (`--password-stdin`): позиционный аргумент виден в `ps` любому пользователю
 * машины и оседает в истории шелла.
 *
 * Печатает хеш в самоописывающем формате `scrypt:N:r:p:saltB64:hashB64` и
 * готовый upsert в таблицу bricks_users. Параметры scrypt продублированы
 * с runtime/server/utils/auth/passwords.ts — контракт только формат строки:
 * verify парсит параметры из самого хеша.
 *
 * `--role` действует ТОЛЬКО при создании учётки. Существующей команда меняет
 * пароль и отзывает её сессии, но не трогает ни роль, ни активность: смена
 * пароля не должна незаметно повышать или понижать права, а восстановление
 * доступа забытому паролю — реактивировать отключённую учётку.
 */
import { randomBytes, scrypt } from 'node:crypto';
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

/** Роли, допустимые CHECK-ограничением bricks_users.role. */
const ALLOWED_ROLES = ['admin', 'editor', 'viewer'];

/** Ctrl+C в сыром режиме приходит символом, а не сигналом. */
const CTRL_C = '\u0003';

/** Backspace терминала (DEL). */
const BACKSPACE = '\u007f';

/** Подсказка по вызову — печатается при любом отказе разбора аргументов. */
const USAGE =
    'Использование: bricks-hash-password --username <name> [--role admin|editor|viewer] [--password-stdin]';

/**
 * Завершает работу с сообщением и подсказкой.
 *
 * @param {string} message Причина отказа.
 * @returns {never} Не возвращается.
 */
function fail(message) {
    console.error(message);
    console.error(USAGE);
    process.exit(1);
}

/**
 * Разбирает argv: --username <name>, --role <role>, --password-stdin.
 *
 * Позиционные и неизвестные аргументы отклоняются, а не игнорируются. Прежде
 * пароль передавался первым позиционным аргументом; молча его пропустив, CLI
 * напечатал бы хеш совсем другого — введённого следом — пароля, а сам пароль
 * остался бы в списке процессов и в истории шелла. Отказ до всякой работы
 * заставляет заметить смену контракта.
 *
 * @param {string[]} argv Аргументы после имени скрипта.
 * @returns {{ username: string, role: string, isPasswordFromStdin: boolean }} Разобранные значения.
 */
function parseArgs(argv) {
    let username = 'admin';
    let role = 'editor';
    let isPasswordFromStdin = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === '--username' || arg === '--role') {
            const value = argv[index + 1];

            if (value === undefined || value.startsWith('--')) {
                fail(`Аргумент ${arg} требует значения`);
            }

            if (arg === '--username') {
                username = value;
            } else {
                role = value;
            }

            index += 1;
            continue;
        }

        if (arg === '--password-stdin') {
            isPasswordFromStdin = true;
            continue;
        }

        fail(
            arg.startsWith('--')
                ? `Неизвестный аргумент: ${arg}`
                : 'Пароль аргументом не принимается: он виден в списке процессов и остаётся в истории шелла. Введите его по запросу или передайте через --password-stdin.'
        );
    }

    return { username, role, isPasswordFromStdin };
}

/** Сегментатор графем: Backspace обязан стирать символ, а не половину пары. */
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Убирает из строки последний видимый символ.
 *
 * Не `slice(0, -1)`: строка хранится в UTF-16, и эмодзи занимает две единицы —
 * обрезка по одной оставила бы одинокий суррогат. Тогда пароль после стирания
 * единственного эмодзи считался бы непустым, и хешировался бы символ замены
 * вместо того, что человек видит на экране. Составные символы (флаги, эмодзи с
 * модификаторами) обрезаются по той же причине целиком, а не по кодовой точке.
 *
 * @param {string} value Текущее значение.
 * @returns {string} Значение без последней графемы.
 */
function dropLastGrapheme(value) {
    const graphemes = [...GRAPHEME_SEGMENTER.segment(value)];

    return graphemes
        .slice(0, -1)
        .map((entry) => entry.segment)
        .join('');
}

/**
 * Запрашивает пароль интерактивно, не отображая ввод.
 *
 * Эхо гасится сырым режимом терминала: обычный `readline.question` печатает
 * пароль на экран, и он остаётся в скроллбэке и на любом плече, которое смотрит
 * через плечо. Режим терминала восстанавливается в `finally` — иначе после
 * Ctrl+C консоль осталась бы без эха.
 *
 * @returns {Promise<string>} Введённый пароль.
 */
async function promptPassword() {
    if (!process.stdin.isTTY) {
        fail(
            'Интерактивный ввод недоступен: stdin не терминал. Передайте пароль через --password-stdin.'
        );
    }

    process.stdout.write('Password: ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    try {
        return await new Promise((resolve, reject) => {
            let value = '';

            /**
             * Обрабатывает очередную порцию ввода терминала.
             *
             * @param {string} chunk Введённые символы.
             * @returns {void}
             */
            function onData(chunk) {
                for (const char of chunk) {
                    // Enter — конец ввода
                    if (char === '\r' || char === '\n') {
                        process.stdin.off('data', onData);
                        process.stdout.write('\n');
                        resolve(value);
                        return;
                    }

                    // Ctrl+C: сырой режим перехватывает его вместо SIGINT
                    if (char === CTRL_C) {
                        process.stdin.off('data', onData);
                        process.stdout.write('\n');
                        reject(new Error('Ввод пароля отменён'));
                        return;
                    }

                    if (char === BACKSPACE || char === '\b') {
                        value = dropLastGrapheme(value);
                        continue;
                    }

                    value += char;
                }
            }

            process.stdin.on('data', onData);
        });
    } finally {
        process.stdin.setRawMode(false);
        process.stdin.pause();
    }
}

/**
 * Читает пароль со stdin целиком (режим `--password-stdin`).
 *
 * @returns {Promise<string>} Пароль без завершающего перевода строки.
 */
async function readPasswordFromStdin() {
    const chunks = [];

    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks)
        .toString('utf8')
        .replace(/\r?\n$/, '');
}

const { username, role, isPasswordFromStdin } = parseArgs(process.argv.slice(2));

if (!ALLOWED_ROLES.includes(role)) {
    console.error(`Role must be one of: ${ALLOWED_ROLES.join(', ')}`);
    process.exit(1);
}

const password = isPasswordFromStdin ? await readPasswordFromStdin() : await promptPassword();

if (!password) {
    console.error('Password must not be empty');
    process.exit(1);
}

const hash = await hashPassword(password);
// Одинарные кавычки в SQL-литерале экранируются удвоением.
// Логин канонизируется в нижний регистр: под уникальным индексом по
// lower(username) `Admin` и `admin` — одна учётка, и поиск при входе тоже
// регистронезависимый
const escapedUsername = username.toLowerCase().replaceAll("'", "''");
const escapedHash = hash.replaceAll("'", "''");

console.log('Password hash:');
console.log(hash);
console.log('');
console.log('SQL:');
console.log(
    `INSERT INTO bricks_users (username, password_hash, role)
VALUES ('${escapedUsername}', '${escapedHash}', '${role}')
-- Цель конфликта — индекс по lower(username), а не колонка: уникальность
-- логина держит именно он. Укажи здесь (username), и вставка 'admin' при
-- существующем 'Admin' не нашла бы конфликта по точной строке, но упёрлась
-- бы в индекс — DO UPDATE такой конфликт не перехватывает, команда просто
-- падала бы с ошибкой уникальности
ON CONFLICT (lower(username)) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    -- Отзыв прежних сессий: они перестают совпадать по auth_version
    auth_version = bricks_users.auth_version + 1;`
);
