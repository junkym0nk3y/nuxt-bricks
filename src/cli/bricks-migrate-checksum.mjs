/**
 * Checksum control of migrations: the bricks_schema_migrations registry keeps
 * the SHA-256 of the SQL as applied, so an edit of an already released file is
 * detected as drift and migrate fails with a diagnostic.
 * Pure functions, no pg — covered by unit tests.
 */
import { createHash } from 'node:crypto';

/**
 * SHA-256 hex of the contents of a migration file.
 *
 * Line endings are normalized to LF before hashing (`\r\n` and a lone `\r` →
 * `\n`): drift control must not depend on line endings — the same migration checked
 * out with CRLF (Windows, core.autocrlf=true) differs in its bytes and would
 * otherwise report a drift that is not one.
 *
 * @param {string} sql Contents of the .sql file.
 * @returns {string} A 64-character hex string.
 */
export function computeMigrationChecksum(sql) {
    const normalized = sql.replace(/\r\n?/g, '\n');
    return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Returns the names of applied migrations whose stored checksum does not match
 * the current file (or whose file is gone).
 *
 * @param {Map<string, string>} fileChecksums File name → checksum as it is now.
 * @param {Array<{name: string, checksum: string}>} appliedRows Registry rows.
 * @returns {string[]} Names of the drifted migrations.
 */
export function findMigrationDrift(fileChecksums, appliedRows) {
    return appliedRows
        .filter((row) => {
            const current = fileChecksums.get(row.name);
            return !current || current !== row.checksum;
        })
        .map((row) => row.name);
}
