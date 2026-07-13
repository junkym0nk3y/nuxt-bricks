// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    computeMigrationChecksum,
    findMigrationDrift,
} from '../../src/cli/bricks-migrate-checksum.mjs';
// #endregion

describe('bricks-migrate checksum: обнаружение drift применённых миграций', () => {
    it('checksum детерминирован и чувствителен к содержимому', () => {
        expect(computeMigrationChecksum('SELECT 1;')).toBe(computeMigrationChecksum('SELECT 1;'));
        expect(computeMigrationChecksum('SELECT 1;')).not.toBe(
            computeMigrationChecksum('SELECT 2;')
        );
        expect(computeMigrationChecksum('SELECT 1;')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('checksum не зависит от line endings: CRLF-checkout не даёт ложный drift', () => {
        const lf = 'SELECT 1;\nSELECT 2;\n';
        const crlf = 'SELECT 1;\r\nSELECT 2;\r\n';
        const loneCr = 'SELECT 1;\rSELECT 2;\r';

        expect(computeMigrationChecksum(crlf)).toBe(computeMigrationChecksum(lf));
        expect(computeMigrationChecksum(loneCr)).toBe(computeMigrationChecksum(lf));

        const files = new Map([['0001.sql', computeMigrationChecksum(crlf)]]);
        const applied = [{ name: '0001.sql', checksum: computeMigrationChecksum(lf) }];

        expect(findMigrationDrift(files, applied)).toEqual([]);
    });

    it('drift — только применённые с checksum, не совпавшим с файлом', () => {
        const files = new Map([
            ['0001.sql', 'aaa'],
            ['0002.sql', 'bbb'],
        ]);
        const applied = [
            { name: '0001.sql', checksum: 'aaa' }, // совпал
            { name: '0002.sql', checksum: 'CHANGED' }, // drift
        ];

        expect(findMigrationDrift(files, applied)).toEqual(['0002.sql']);
    });

    it('применённая миграция без файла на диске — тоже drift', () => {
        const files = new Map([['0001.sql', 'aaa']]);
        const applied = [{ name: '0009_removed.sql', checksum: 'xyz' }];

        expect(findMigrationDrift(files, applied)).toEqual(['0009_removed.sql']);
    });
});
