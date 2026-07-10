#!/usr/bin/env node
/**
 * CLI версионированных миграций Postgres-схемы nuxt-bricks.
 *
 * Использование:
 *   npm run bricks:migrate -- status            # applied/pending список
 *   npm run bricks:migrate -- migrate           # применить pending миграции
 *   npx bricks-migrate migrate --url postgres://user:pass@host:5432/db
 *
 * Подключение: --url, иначе NUXT_BRICKS_DATABASE_URL, иначе DATABASE_URL.
 * Файлы миграций — `migrations/*.sql` в корне пакета, применяются в
 * лексикографическом порядке; каждая — в своей транзакции, серия — под
 * pg_advisory_lock (параллельные deploy job не подерутся). Реестр применённых —
 * таблица bricks_schema_migrations. Роль подключения должна иметь DDL-права —
 * runtime-роли приложения они не нужны.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// Ключ pg_advisory_lock серии миграций (стабильный произвольный идентификатор)
const MIGRATION_LOCK_KEY = 793_452_101;

/** Каталог миграций: и в репо (src/cli/../..), и в пакете (dist/cli/../..) — корень. */
const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Печатает usage и завершает процесс.
 */
function printUsageAndExit() {
    console.log(
        [
            'Использование: bricks-migrate <command> [--url <postgres-url>]',
            '',
            'Команды:',
            '  status    показать applied/pending миграции',
            '  migrate   применить все pending миграции',
            '',
            'Подключение: --url, иначе env NUXT_BRICKS_DATABASE_URL, иначе DATABASE_URL.',
        ].join('\n')
    );
    process.exit(1);
}

/**
 * Разбирает аргументы командной строки.
 *
 * @returns {{ command: string, url: string }} Команда и строка подключения.
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command !== 'status' && command !== 'migrate') {
        printUsageAndExit();
    }

    const urlFlagIndex = args.indexOf('--url');
    const url =
        (urlFlagIndex !== -1 ? args[urlFlagIndex + 1] : undefined) ||
        process.env.NUXT_BRICKS_DATABASE_URL ||
        process.env.DATABASE_URL;

    if (!url) {
        console.error(
            '[bricks-migrate] Не задана строка подключения: --url, NUXT_BRICKS_DATABASE_URL или DATABASE_URL.'
        );
        process.exit(1);
    }

    return { command, url };
}

/**
 * Динамически импортирует pg с понятной ошибкой (peer-зависимость database-режима).
 *
 * @returns {Promise<import('pg')>} Модуль pg.
 */
async function loadPg() {
    try {
        return (await import('pg')).default;
    } catch {
        console.error(
            '[bricks-migrate] Пакет "pg" не установлен. Установите его в проекте: npm install pg'
        );
        process.exit(1);
    }
}

/**
 * Читает файлы миграций в лексикографическом порядке.
 *
 * @returns {Promise<string[]>} Имена *.sql файлов.
 */
async function listMigrationFiles() {
    let entries;

    try {
        entries = await readdir(MIGRATIONS_DIR);
    } catch {
        console.error(`[bricks-migrate] Каталог миграций не найден: ${MIGRATIONS_DIR}`);
        process.exit(1);
    }

    return entries.filter((name) => name.endsWith('.sql')).sort();
}

/**
 * Создаёт (идемпотентно) реестр применённых миграций и возвращает его содержимое.
 *
 * @param {import('pg').Client} client Подключённый клиент.
 * @returns {Promise<Set<string>>} Имена применённых миграций.
 */
async function readAppliedMigrations(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS bricks_schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `);

    const result = await client.query('SELECT name FROM bricks_schema_migrations ORDER BY name');
    return new Set(result.rows.map((row) => row.name));
}

/**
 * Печатает статус миграций.
 *
 * @param {string[]} files Все файлы миграций.
 * @param {Set<string>} applied Применённые миграции.
 */
function printStatus(files, applied) {
    if (files.length === 0) {
        console.log('[bricks-migrate] Файлы миграций не найдены.');
        return;
    }

    for (const file of files) {
        console.log(`  ${applied.has(file) ? '[applied]' : '[pending]'} ${file}`);
    }

    const pendingCount = files.filter((file) => !applied.has(file)).length;
    console.log(`\n${files.length - pendingCount} applied, ${pendingCount} pending.`);
}

/**
 * Применяет pending миграции: каждая — в своей транзакции.
 *
 * @param {import('pg').Client} client Подключённый клиент.
 * @param {string[]} files Все файлы миграций.
 * @param {Set<string>} applied Применённые миграции.
 */
async function applyPendingMigrations(client, files, applied) {
    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
        console.log('[bricks-migrate] Все миграции уже применены.');
        return;
    }

    for (const file of pending) {
        const sql = await readFile(new URL(file, `file://${MIGRATIONS_DIR}`), 'utf-8');

        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO bricks_schema_migrations (name) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`  [applied] ${file}`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`  [failed]  ${file}`);
            throw error;
        }
    }

    console.log(`\n[bricks-migrate] Применено миграций: ${pending.length}.`);
}

async function main() {
    const { command, url } = parseArgs();
    const pg = await loadPg();
    const client = new pg.Client({ connectionString: url });

    await client.connect();

    try {
        await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

        const files = await listMigrationFiles();
        const applied = await readAppliedMigrations(client);

        if (command === 'status') {
            printStatus(files, applied);
            return;
        }

        await applyPendingMigrations(client, files, applied);
    } finally {
        // Неснятый advisory lock Postgres снимет сам при разрыве соединения
        await client
            .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
            .catch((error) => console.warn('[bricks-migrate] Failed to release lock:', error));
        await client.end();
    }
}

main().catch((error) => {
    console.error('[bricks-migrate] Ошибка:', error.message || error);
    process.exit(1);
});
