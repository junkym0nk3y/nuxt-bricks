// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { parseBricksBooleanFlag } from '../../src/runtime/modules/common/utils/main';
// #endregion

/**
 * Флаги приезжают тремя путями: boolean из опций модуля, строка из env на сборке
 * и строка, которой Nitro накрывает runtimeConfig в собранном приложении. Третий
 * путь и делает пустую строку опасной: она проходит мимо build-time
 * нормализации и попадает сюда как есть.
 */
describe('parseBricksBooleanFlag: приведение значения флага', () => {
    it('пропускает boolean как есть', () => {
        expect(parseBricksBooleanFlag(true)).toBe(true);
        expect(parseBricksBooleanFlag(false)).toBe(false);
        expect(parseBricksBooleanFlag(false, true)).toBe(false);
    });

    it('понимает строковые формы включения и всё прочее считает выключением', () => {
        for (const value of ['true', '1', 'YES', ' on ']) {
            expect(parseBricksBooleanFlag(value), value).toBe(true);
        }

        for (const value of ['false', '0', 'no', 'мусор']) {
            // Дефолт «включено» такие значения не спасает: флаг задан, и задан не
            // включением
            expect(parseBricksBooleanFlag(value, true), value).toBe(false);
        }
    });

    it('считает пустую строку незаданным флагом, а не выключением', () => {
        // `BRICKS_AUTH_ALLOW_USER_MANAGEMENT=` объявляет переменную без значения:
        // раздел с дефолтом «включено» иначе гас бы у всех, включая администратора
        expect(parseBricksBooleanFlag('', true)).toBe(true);
        expect(parseBricksBooleanFlag('   ', true)).toBe(true);
        expect(parseBricksBooleanFlag('')).toBe(false);
    });

    it('отдаёт дефолт незаданному значению и выключение — значению чужого типа', () => {
        expect(parseBricksBooleanFlag(undefined, true)).toBe(true);
        expect(parseBricksBooleanFlag(null, true)).toBe(true);
        expect(parseBricksBooleanFlag(undefined)).toBe(false);

        // Число или объект — не «не задано», а неверно заданный флаг
        expect(parseBricksBooleanFlag(1, true)).toBe(false);
        expect(parseBricksBooleanFlag({}, true)).toBe(false);
    });
});
