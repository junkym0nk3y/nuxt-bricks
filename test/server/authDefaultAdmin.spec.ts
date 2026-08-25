// #region Imports
// Node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { needsPasswordRehash, verifyPassword } from '../../src/runtime/server/utils/auth/passwords';
import { BRICKS_DEFAULT_ADMIN_PASSWORD_HASH } from '../../src/runtime/modules/persistence/server/utils/defaultAdmin';
import {
    BRICKS_DEFAULT_ADMIN_PASSWORD,
    BRICKS_DEFAULT_ADMIN_USERNAME,
} from '../../src/runtime/modules/common/constants/auth';
// #endregion

// #region Data
const MIGRATION_SQL = readFileSync(
    fileURLToPath(new URL('../../migrations/0001_init.sql', import.meta.url)),
    'utf8'
);

/** Стейтмент сида целиком — от INSERT до строки конфликта. */
const SEED_STATEMENT = MIGRATION_SQL.slice(
    MIGRATION_SQL.indexOf('INSERT INTO bricks_users'),
    MIGRATION_SQL.indexOf('ON CONFLICT', MIGRATION_SQL.indexOf('INSERT INTO bricks_users'))
);

/** Значения VALUES по порядку колонок: username, password_hash, role. */
const SEED_VALUES = (SEED_STATEMENT.match(/VALUES\s*\(([\s\S]*)\)/) ?? ['', ''])[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
// #endregion

describe('дефолтный администратор: сид миграции и его константы', () => {
    it('хеш из константы принимает дефолтный пароль', async () => {
        await expect(
            verifyPassword(BRICKS_DEFAULT_ADMIN_PASSWORD, BRICKS_DEFAULT_ADMIN_PASSWORD_HASH)
        ).resolves.toBe(true);
    });

    // Whether the password is still the default one is computed by COMPARING STRINGS
    // right in the session query, so the seed hash is obliged to be written with the
    // current parameters. Left behind them, the first sign-in of the default
    // administrator would rehash the row, the comparison would stop matching, and the
    // warning would go out while the password is still the published default
    it('сидовый хеш написан нынешними параметрами и рехеша не требует', () => {
        expect(BRICKS_DEFAULT_ADMIN_PASSWORD_HASH.startsWith('scrypt:16384:8:5:')).toBe(true);
        expect(needsPasswordRehash(BRICKS_DEFAULT_ADMIN_PASSWORD_HASH)).toBe(false);
    });

    it('хеш из константы не принимает другой пароль', async () => {
        await expect(
            verifyPassword(`${BRICKS_DEFAULT_ADMIN_PASSWORD}!`, BRICKS_DEFAULT_ADMIN_PASSWORD_HASH)
        ).resolves.toBe(false);
    });

    // Литерал в SQL и константа в коде — две копии одной строки: у Postgres нет
    // scrypt, посчитать хеш в миграции нечем. Разъехавшись, они не сломали бы ни
    // вход, ни миграцию — молча погасло бы предупреждение о дефолтном пароле,
    // потому что сравнение хешей перестало бы совпадать.
    it('литерал сида в миграции совпадает с константой', () => {
        expect(MIGRATION_SQL).toContain(`'${BRICKS_DEFAULT_ADMIN_PASSWORD_HASH}'`);
    });

    // Разбор идёт по СПИСКУ значений, а не поиском подстроки по файлу: `admin` —
    // ещё и роль, и слово в комментариях, поэтому подмена логина на `root`
    // прошла бы незамеченной, а свежая установка не приняла бы документированные
    // креды.
    it('сид заводит учётку с документированными логином, хешем и ролью admin', () => {
        expect(SEED_VALUES).toEqual([
            `'${BRICKS_DEFAULT_ADMIN_USERNAME}'`,
            `'${BRICKS_DEFAULT_ADMIN_PASSWORD_HASH}'`,
            "'admin'",
        ]);
        expect(SEED_STATEMENT).toMatch(
            /INSERT INTO bricks_users\s*\(username, password_hash, role\)/
        );
    });

    it('повторное применение сида существующую учётку не трогает', () => {
        // Цель конфликта — индекс по lower(username): уникальность логина держит
        // именно он, и указание колонки не перехватило бы конфликт вовсе.
        expect(MIGRATION_SQL).toContain('ON CONFLICT (lower(username)) DO NOTHING');
    });
});
