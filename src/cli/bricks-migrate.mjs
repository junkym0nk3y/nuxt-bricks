#!/usr/bin/env node
/**
 * CLI of the versioned migrations of the nuxt-bricks Postgres schema.
 *
 * Usage:
 *   npm run bricks:migrate -- status            # the applied/pending list
 *   npm run bricks:migrate -- migrate           # apply the pending migrations
 *   npx bricks-migrate migrate --url postgres://user:pass@host:5432/db
 *
 * Connection: --url, else NUXT_BRICKS_DATABASE_URL, else DATABASE_URL.
 * The migration files are `migrations/*.sql` in the package root, applied in
 * lexicographic order; each one in a transaction of its own, the series under a
 * pg_advisory_lock (parallel deploy jobs will not fight). The registry of the
 * applied ones is the bricks_schema_migrations table. The connecting role has to
 * hold DDL rights — the application's runtime role does not need them.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { computeMigrationChecksum, findMigrationDrift } from './bricks-migrate-checksum.mjs';

// pg_advisory_lock key of the migration series (a stable arbitrary identifier)
const MIGRATION_LOCK_KEY = 793_452_101;

/**
 * Migrations directory: the root — src/cli/../.. in the repo, dist/cli/../.. once
 * installed.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Prints the usage and exits the process.
 */
function printUsageAndExit() {
    console.log(
        [
            'Usage: bricks-migrate <command> [--url <postgres-url>]',
            '',
            'Commands:',
            '  status    show the applied/pending migrations',
            '  migrate   apply every pending migration',
            '',
            'Connection: --url, else env NUXT_BRICKS_DATABASE_URL, else DATABASE_URL.',
        ].join('\n')
    );
    process.exit(1);
}

/**
 * Parses the command line arguments.
 *
 * @returns {{ command: string, url: string }} The command and the connection string.
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
            '[bricks-migrate] No connection string given: --url, NUXT_BRICKS_DATABASE_URL or DATABASE_URL.'
        );
        process.exit(1);
    }

    return { command, url };
}

/**
 * Imports pg dynamically, with a legible error (a peer dependency of database mode).
 *
 * @returns {Promise<import('pg')>} The pg module.
 */
async function loadPg() {
    try {
        return (await import('pg')).default;
    } catch {
        console.error(
            '[bricks-migrate] The "pg" package is not installed. Install it in the project: npm install pg'
        );
        process.exit(1);
    }
}

/**
 * Reads the migration files in lexicographic order.
 *
 * @returns {Promise<string[]>} Names of the *.sql files.
 */
async function listMigrationFiles() {
    let entries;

    try {
        entries = await readdir(MIGRATIONS_DIR);
    } catch {
        console.error(`[bricks-migrate] Migrations directory not found: ${MIGRATIONS_DIR}`);
        process.exit(1);
    }

    return entries.filter((name) => name.endsWith('.sql')).sort();
}

/**
 * Creates (idempotently) the registry of applied migrations and returns its rows
 * (name plus checksum — the drift control).
 *
 * @param {import('pg').Client} client A connected client.
 * @returns {Promise<Array<{name: string, checksum: string}>>} Registry rows.
 */
async function readAppliedMigrations(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS bricks_schema_migrations (
            name TEXT PRIMARY KEY,
            checksum TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    const result = await client.query(
        'SELECT name, checksum FROM bricks_schema_migrations ORDER BY name'
    );
    return result.rows;
}

/**
 * Reads the contents of the migrations and computes their checksums.
 *
 * @param {string[]} files File names.
 * @returns {Promise<Map<string, {sql: string, checksum: string}>>} Per file name.
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
 * Prints the migration status.
 *
 * @param {string[]} files All the migration files.
 * @param {Set<string>} applied The applied migrations.
 * @param {string[]} drifted Names of the migrations found to have drifted.
 */
function printStatus(files, applied, drifted) {
    if (files.length === 0) {
        console.log('[bricks-migrate] No migration files found.');
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
        console.log(`${driftedSet.size} drifted (the SQL changed after it was applied).`);
    }
}

/**
 * Applies the pending migrations: each one in a transaction of its own.
 *
 * @param {import('pg').Client} client A connected client.
 * @param {string[]} files All the migration files.
 * @param {Set<string>} applied The applied migrations.
 * @param {Map<string, {sql: string, checksum: string}>} contents Read once.
 */
async function applyPendingMigrations(client, files, applied, contents) {
    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
        console.log('[bricks-migrate] Every migration has already been applied.');
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

    console.log(`\n[bricks-migrate] Migrations applied: ${pending.length}.`);
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
                `[bricks-migrate] Drift of applied migrations (the SQL changed after it was applied): ${drifted.join(', ')}.\n` +
                    'Released migrations must not be edited — ship the change as a new forward migration.'
            );
            process.exit(1);
        }

        await applyPendingMigrations(client, files, applied, contents);
    } finally {
        // An advisory lock left in place is released by Postgres itself once the
        // connection drops
        await client
            .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
            .catch((error) => console.warn('[bricks-migrate] Failed to release lock:', error));
        await client.end();
    }
}

main().catch((error) => {
    console.error('[bricks-migrate] Error:', error.message || error);
    process.exit(1);
});
