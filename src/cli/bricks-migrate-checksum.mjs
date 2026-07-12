/**
 * Checksum-контроль миграций (аудит A-10): реестр bricks_schema_migrations
 * хранит SHA-256 применённого SQL — редактирование уже выпущенного файла
 * обнаруживается как drift и валит migrate с диагностикой.
 * Чистые функции без pg — тестируются юнитами.
 */
import { createHash } from 'node:crypto';

/**
 * SHA-256 hex содержимого файла миграции.
 *
 * Перед хешированием переводы строк нормализуются к LF (`\r\n` и одиночный
 * `\r` → `\n`): drift-контроль не зависит от line endings — байтово-идентичная
 * миграция, полученная checkout'ом с CRLF (Windows, core.autocrlf=true), не
 * должна давать ложный drift.
 *
 * @param {string} sql Содержимое .sql файла.
 * @returns {string} 64-символьный hex.
 */
export function computeMigrationChecksum(sql) {
    const normalized = sql.replace(/\r\n?/g, '\n');
    return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Возвращает имена применённых миграций, чей сохранённый checksum не
 * совпадает с текущим файлом (или файла больше нет). Записи без checksum
 * (до введения контроля) drift'ом не считаются — их backfill'ит migrate.
 *
 * @param {Map<string, string>} fileChecksums Имя файла → checksum текущего содержимого.
 * @param {Array<{name: string, checksum: string | null}>} appliedRows Строки реестра.
 * @returns {string[]} Имена drift-миграций.
 */
export function findMigrationDrift(fileChecksums, appliedRows) {
    return appliedRows
        .filter((row) => {
            if (!row.checksum) {
                return false;
            }

            const current = fileChecksums.get(row.name);
            return !current || current !== row.checksum;
        })
        .map((row) => row.name);
}
