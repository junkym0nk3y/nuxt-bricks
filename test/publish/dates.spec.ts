// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { formatPageDate } from '../../src/runtime/modules/builder/publish/utils/dates';
// #endregion

describe('formatPageDate: дата строки списка и панели деталей', () => {
    it('форматирует ISO-строку в DD.MM.YYYY', () => {
        expect(formatPageDate('2026-07-04T12:30:00')).toBe('04.07.2026');
    });

    it('дополняет день и месяц нулями', () => {
        expect(formatPageDate('2026-01-09T00:00:00')).toBe('09.01.2026');
    });

    it('возвращает «—» для пустых значений', () => {
        expect(formatPageDate('')).toBe('—');
        expect(formatPageDate(null)).toBe('—');
        expect(formatPageDate(undefined)).toBe('—');
    });

    it('возвращает «—» для битой даты', () => {
        expect(formatPageDate('not-a-date')).toBe('—');
    });
});
