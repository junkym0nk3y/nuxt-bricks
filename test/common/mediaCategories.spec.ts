// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    ALL_MEDIA_CATEGORIES_FILTER,
    MEDIA_CATEGORY_SLUG_MAX_LENGTH,
    mediaCategoryLabelToSlug,
} from '../../src/runtime/modules/common/constants/mediaCategories';
// #endregion

describe('slug категории выводится из подписи на сервере', () => {
    it('кириллица транслитерируется: slug уезжает в колонку и в значение фильтра', () => {
        expect(mediaCategoryLabelToSlug('Промо')).toBe('promo');
        expect(mediaCategoryLabelToSlug('Баннеры сайта')).toBe('bannery-sayta');
        expect(mediaCategoryLabelToSlug('Соцсети')).toBe('socseti');
    });

    it('мягкий и твёрдый знаки отбрасываются, а не превращаются в дефис', () => {
        expect(mediaCategoryLabelToSlug('Объявления')).toBe('obyavleniya');
        expect(mediaCategoryLabelToSlug('Статьи')).toBe('stati');
    });

    it('разделители сжимаются, края обрезаются', () => {
        expect(mediaCategoryLabelToSlug('  Hero   images!!  ')).toBe('hero-images');
        expect(mediaCategoryLabelToSlug('--- promo ---')).toBe('promo');
    });

    it('подпись без букв и цифр даёт пустой slug — ручка обязана отклонить такую', () => {
        expect(mediaCategoryLabelToSlug('!!!')).toBe('');
        expect(mediaCategoryLabelToSlug('   ')).toBe('');
    });

    it('slug не длиннее колонки VARCHAR(50) и не кончается дефисом от обрезки', () => {
        const slug = mediaCategoryLabelToSlug('а'.repeat(80));

        expect(slug.length).toBeLessThanOrEqual(MEDIA_CATEGORY_SLUG_MAX_LENGTH);
        expect(slug.endsWith('-')).toBe(false);
    });

    it('подпись «All» даёт служебное значение фильтра — ручка обязана его отклонить', () => {
        expect(mediaCategoryLabelToSlug('All')).toBe(ALL_MEDIA_CATEGORIES_FILTER);
    });
});
