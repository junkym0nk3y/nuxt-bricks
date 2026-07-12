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
import { computeMigrationChecksum, findMigrationDrift } from './bricks-migrate-checksum.mjs';

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
 * Создаёт (идемпотентно) реестр применённых миграций и возвращает его строки
 * (имя + checksum — контроль drift'а, аудит A-10).
 *
 * @param {import('pg').Client} client Подключённый клиент.
 * @returns {Promise<Array<{name: string, checksum: string | null}>>} Строки реестра.
 */
async function readAppliedMigrations(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS bricks_schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await client.query(
        'ALTER TABLE bricks_schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT'
    );

    const result = await client.query(
        'SELECT name, checksum FROM bricks_schema_migrations ORDER BY name'
    );
    return result.rows;
}

/**
 * Читает содержимое миграций и считает checksums.
 *
 * @param {string[]} files Имена файлов.
 * @returns {Promise<Map<string, {sql: string, checksum: string}>>} Имя файла → содержимое и checksum.
 */
async function readMigrationContents(files) {
    const contents = new Map();

    for (const file of files) {
        const sql = await readFile(new URL(file, `file://${MIGRATIONS_DIR}`), 'utf-8');
        contents.set(file, { sql, checksum: computeMigrationChecksum(sql) });
    }

    return contents;
}

/**
 * Backfill'ит checksum для строк реестра, применённых до введения контроля
 * (checksum == null), если файл миграции ещё существует на диске.
 *
 * @param {import('pg').Client} client Подключённый клиент.
 * @param {Array<{name: string, checksum: string | null}>} appliedRows Строки реестра.
 * @param {Map<string, {sql: string, checksum: string}>} contents Содержимое файлов.
 */
async function backfillMigrationChecksums(client, appliedRows, contents) {
    for (const row of appliedRows) {
        if (row.checksum) {
            continue;
        }

        const file = contents.get(row.name);

        if (!file) {
            continue;
        }

        await client.query('UPDATE bricks_schema_migrations SET checksum = $2 WHERE name = $1', [
            row.name,
            file.checksum,
        ]);
        console.log(`  [checksum backfilled] ${row.name}`);
    }
}

/**
 * Печатает статус миграций.
 *
 * @param {string[]} files Все файлы миграций.
 * @param {Set<string>} applied Применённые миграции.
 * @param {string[]} drifted Имена миграций с обнаруженным drift'ом.
 */
function printStatus(files, applied, drifted) {
    if (files.length === 0) {
        console.log('[bricks-migrate] Файлы миграций не найдены.');
        return;
    }

    const driftedSet = new Set(drifted);

    for (const file of files) {
        const marker = driftedSet.has(file)
            ? '[drift]  '
            : applied.has(file)
              ? '[applied]'
              : '[pending]';
        console.log(`  ${marker} ${file}`);
    }

    const pendingCount = files.filter((file) => !applied.has(file)).length;
    console.log(`\n${files.length - pendingCount} applied, ${pendingCount} pending.`);

    if (driftedSet.size > 0) {
        console.log(`${driftedSet.size} drifted (SQL изменён после применения).`);
    }
}

/**
 * Применяет pending миграции: каждая — в своей транзакции.
 *
 * @param {import('pg').Client} client Подключённый клиент.
 * @param {string[]} files Все файлы миграций.
 * @param {Set<string>} applied Применённые миграции.
 * @param {Map<string, {sql: string, checksum: string}>} contents Содержимое файлов (без повторного чтения).
 */
async function applyPendingMigrations(client, files, applied, contents) {
    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
        console.log('[bricks-migrate] Все миграции уже применены.');
        return;
    }

    for (const file of pending) {
        const { sql, checksum } = contents.get(file);

        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query(
                'INSERT INTO bricks_schema_migrations (name, checksum) VALUES ($1, $2)',
                [file, checksum]
            );
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
        const contents = await readMigrationContents(files);
        const appliedRows = await readAppliedMigrations(client);

        const fileChecksums = new Map([...contents].map(([name, v]) => [name, v.checksum]));
        const applied = new Set(appliedRows.map((row) => row.name));
        const drifted = findMigrationDrift(fileChecksums, appliedRows);

        if (command === 'status') {
            printStatus(files, applied, drifted);
            return;
        }

        if (drifted.length > 0) {
            console.error(
                `[bricks-migrate] Drift применённых миграций (SQL изменён после применения): ${drifted.join(', ')}.\n` +
                    'Выпущенные миграции не редактируются — изменения оформляются новой forward-миграцией.'
            );
            process.exit(1);
        }

        await backfillMigrationChecksums(client, appliedRows, contents);
        await applyPendingMigrations(client, files, applied, contents);
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
