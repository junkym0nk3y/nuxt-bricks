/**
 * Сторож дрейфа между backfill-скриптом и рантаймом.
 *
 * Скрипт запускается голым node и потому держит свою копию пресетов вариантов
 * (импортировать TS-модуль рантайма он не может — ни один `.mjs` в проекте этого
 * не делает). Копия ничем не была связана с оригиналом: смена `preview.maxWidth`
 * в рантайме молча оставляла бы догенерённые варианты другого размера, и разница
 * между старыми и новыми картинками выглядела бы случайной.
 *
 * Спека читает текст ядра скрипта, а не импортирует его: нужны именно литералы,
 * а не собранные значения.
 */

// #region Imports
// Node
import { readFileSync } from 'node:fs';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { MEDIA_VARIANT_PRESETS } from '../../src/runtime/modules/persistence/server/utils/mediaVariants';
// #endregion

const SCRIPT_SOURCE = readFileSync(
    new URL('../../scripts/backfill-variants-core.mjs', import.meta.url),
    'utf8'
);

describe('backfill догоняет варианты теми же параметрами, что ручка загрузки', () => {
    it('каждый пресет рантайма присутствует в скрипте с теми же числами', () => {
        for (const [variant, preset] of Object.entries(MEDIA_VARIANT_PRESETS)) {
            const entry = new RegExp(
                `name:\\s*'${variant}'[^}]*maxWidth:\\s*${preset.maxWidth}\\b[^}]*quality:\\s*${preset.quality}\\b`
            );

            expect(SCRIPT_SOURCE).toMatch(entry);
        }
    });

    it('скрипт не описывает вариантов, которых в рантайме нет', () => {
        const scriptVariants = [...SCRIPT_SOURCE.matchAll(/name:\s*'(\w+)',\s*suffix:/g)].map(
            (match) => match[1]
        );

        expect(scriptVariants.sort()).toEqual(Object.keys(MEDIA_VARIANT_PRESETS).sort());
    });
});
