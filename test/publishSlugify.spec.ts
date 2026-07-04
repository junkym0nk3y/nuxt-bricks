// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { slugifyPageTitle } from '../src/runtime/modules/builder/publish/utils/slugify';
// #endregion

describe('slugifyPageTitle: авто-slug из названия страницы', () => {
    it('транслитерирует кириллицу в латиницу', () => {
        expect(slugifyPageTitle('Новая страница')).toBe('novaya-stranitsa');
        expect(slugifyPageTitle('Ёжик в тумане')).toBe('ezhik-v-tumane');
        expect(slugifyPageTitle('Объём и мощь')).toBe('obem-i-mosch');
    });

    it('приводит к нижнему регистру и заменяет спецсимволы дефисами', () => {
        expect(slugifyPageTitle('Hello, World!')).toBe('hello-world');
        expect(slugifyPageTitle('Prices — 2026 (draft)')).toBe('prices-2026-draft');
    });

    it('схлопывает последовательности разделителей в один дефис', () => {
        expect(slugifyPageTitle('a   b---c!!!d')).toBe('a-b-c-d');
    });

    it('срезает дефисы по краям', () => {
        expect(slugifyPageTitle('  --About us--  ')).toBe('about-us');
    });

    it('возвращает пустую строку для «непереводимого» названия', () => {
        expect(slugifyPageTitle('')).toBe('');
        expect(slugifyPageTitle('!!! ***')).toBe('');
        expect(slugifyPageTitle('日本語')).toBe('');
    });

    it('обрезает результат до 80 символов без хвостового дефиса', () => {
        const longTitle = `${'a'.repeat(79)} tail`;
        const slug = slugifyPageTitle(longTitle);

        expect(slug.length).toBeLessThanOrEqual(80);
        expect(slug.endsWith('-')).toBe(false);
        expect(slug).toBe('a'.repeat(79));
    });
});
