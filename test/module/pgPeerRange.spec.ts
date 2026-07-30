// #region Imports
// Node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';
// #endregion

/**
 * Серверный лимит времени SQL ставится хуком выдачи соединения (`onConnect`
 * пула). Хук появился в `pg-pool@3.13.0`, который приходит с `pg@8.20.0`: на
 * более старом драйвере опция молча игнорируется, клиент выдаётся сразу, и
 * лимит из строки подключения снова перекрывает настройку — то есть обещание
 * README перестаёт выполняться, ничем себя не выдавая.
 *
 * Поэтому нижняя граница peer-диапазона — часть контракта, а не вкусовщина.
 */

/** Минимальная версия драйвера, у которой пул дожидается хука подключения. */
const MIN_PG_MAJOR = 8;
const MIN_PG_MINOR = 20;

describe('peer-диапазон pg покрывает только версии с хуком подключения', () => {
    it('нижняя граница не опускается ниже версии, где появился onConnect', () => {
        const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
            peerDependencies: Record<string, string>;
        };

        const range = packageJson.peerDependencies.pg;
        const [major, minor] = (range.match(/(\d+)\.(\d+)\.\d+/) ?? []).slice(1).map(Number);

        expect(range).toMatch(/^\^\d+\.\d+\.\d+$/);
        expect(major).toBe(MIN_PG_MAJOR);
        expect(minor).toBeGreaterThanOrEqual(MIN_PG_MINOR);
    });
});
