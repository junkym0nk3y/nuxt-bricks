// #region Imports
// Vitest
import { afterEach, describe, expect, it } from 'vitest';

// Utils
import {
    hasOwnKey,
    readOwnKey,
    toSafeRecord,
} from '../../src/runtime/modules/common/utils/safeRecord';
// #endregion

/** Имена, которые обычный объект «находит» в `Object.prototype`. */
const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'] as const;

describe('safeRecord: доступ по ключу из недоверенного источника', () => {
    afterEach(() => {
        // Страховка от протекания загрязнения между кейсами
        expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain('polluted');
    });

    it('hasOwnKey не считает унаследованные prototype-ключи собственными', () => {
        PROTOTYPE_KEYS.forEach((key) => {
            expect(hasOwnKey({}, key)).toBe(false);
        });
    });

    it('readOwnKey возвращает undefined для всех prototype-ключей', () => {
        PROTOTYPE_KEYS.forEach((key) => {
            expect(readOwnKey({} as Record<string, unknown>, key)).toBeUndefined();
        });
    });

    it('hasOwnKey/readOwnKey видят собственные ключи с теми же именами', () => {
        const target = JSON.parse('{"constructor": 1, "toString": 2, "hasOwnProperty": 3}');

        expect(hasOwnKey(target, 'constructor')).toBe(true);
        expect(readOwnKey(target, 'toString')).toBe(2);
        expect(readOwnKey(target, 'hasOwnProperty')).toBe(3);
    });

    it('toSafeRecord делает специальные имена собственными свойствами', () => {
        const record = toSafeRecord([
            ['constructor', 1],
            ['toString', 2],
            ['hasOwnProperty', 3],
        ]);

        expect(Object.getOwnPropertyNames(record)).toEqual([
            'constructor',
            'toString',
            'hasOwnProperty',
        ]);
        expect(record.constructor).toBe(1);
    });

    it('toSafeRecord отбрасывает __proto__ и не подменяет прототип результата', () => {
        const record = toSafeRecord<unknown>([
            ['__proto__', { polluted: true }],
            ['title', 'ok'],
        ]);

        expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
        expect(Object.getOwnPropertyNames(record)).toEqual(['title']);
        expect((record as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it('toSafeRecord принимает Map как источник пар', () => {
        const record = toSafeRecord(
            new Map([
                ['a', 1],
                ['b', 2],
            ])
        );

        expect(record).toEqual({ a: 1, b: 2 });
    });
});
