// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    parseKeywords,
    serializeKeywords,
} from '../../src/runtime/modules/builder/publish/utils/keywords';
// #endregion

describe('parseKeywords: строка ключевых слов → список тегов', () => {
    it('режет по запятой и обрезает пробелы', () => {
        expect(parseKeywords(' promo ,page,  marketing ')).toEqual(['promo', 'page', 'marketing']);
    });

    it('отбрасывает пустые фрагменты между запятыми', () => {
        expect(parseKeywords('promo,,page,   ,')).toEqual(['promo', 'page']);
    });

    it('снимает дубли, сохраняя порядок первого вхождения', () => {
        expect(parseKeywords('promo, page, promo')).toEqual(['promo', 'page']);
    });

    it('различает теги по регистру: PROMO и promo — разные слова', () => {
        expect(parseKeywords('promo, PROMO')).toEqual(['promo', 'PROMO']);
    });

    it('отдаёт пустой список на пустом и null значении', () => {
        expect(parseKeywords('')).toEqual([]);
        expect(parseKeywords(null)).toEqual([]);
        expect(parseKeywords(undefined)).toEqual([]);
    });
});

describe('serializeKeywords: список тегов → строка ключевых слов', () => {
    it('склеивает тем же разделителем, по которому строка разбирается обратно', () => {
        const tags = ['promo', 'page', 'marketing'];
        const value = serializeKeywords(tags);

        expect(value).toBe('promo, page, marketing');
        expect(parseKeywords(value)).toEqual(tags);
    });

    it('пустой список даёт пустую строку', () => {
        expect(serializeKeywords([])).toBe('');
    });
});
