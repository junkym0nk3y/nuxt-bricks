// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_LAYOUT,
    normalizePublishedPage,
    preserveSchema,
} from '../src/runtime/modules/common/utils/bricks/publishedPage';
// #endregion

describe('preserveSchema', () => {
    it('возвращает пустую схему для null/undefined', () => {
        expect(preserveSchema(null)).toEqual({ components: [] });
        expect(preserveSchema(undefined)).toEqual({ components: [] });
    });

    it('сохраняет meta только если она не пуста', () => {
        expect(preserveSchema({ components: [], meta: {} })).toEqual({ components: [] });

        const meta = { navigation: { items: [] } };
        expect(preserveSchema({ components: [], meta })).toEqual({ components: [], meta });
    });
});

describe('normalizePublishedPage', () => {
    const rawPage = {
        id: 7,
        pagename: 'landing',
        title: 'Landing',
        background_color: '#000000',
        social_image: 'og.png',
        url_prefix: 'blog',
        created_at: '2026-01-01',
        published: 1,
        schema: { components: [{ id: 'c1', props: { snake_key: 'untouched' } }] },
    };

    it('конвертирует snake_case ключи, но не трогает содержимое schema', () => {
        const page = normalizePublishedPage(rawPage);

        expect(page.backgroundColor).toBe('#000000');
        expect(page.socialImage).toBe('og.png');
        expect(page.urlPrefix).toBe('blog');
        expect(page.schema.components[0]).toEqual({
            id: 'c1',
            props: { snake_key: 'untouched' },
        });
    });

    it('подставляет дефолты для отсутствующих полей', () => {
        const page = normalizePublishedPage({ id: 1, pagename: 'p' });

        expect(page.title).toBe('');
        expect(page.backgroundColor).toBe(DEFAULT_BACKGROUND_COLOR);
        expect(page.layout).toBe(DEFAULT_LAYOUT);
        expect(page.urlPrefix).toBeNull();
        expect(page.subdomain).toBeNull();
        expect(page.schema).toEqual({ components: [] });
        expect(page.published).toBe(false);
    });

    it('принимает кастомный дефолтный цвет фона', () => {
        const page = normalizePublishedPage({ id: 1, pagename: 'p' }, '#ABCDEF');
        expect(page.backgroundColor).toBe('#ABCDEF');
    });

    it('updatedAt падает обратно на createdAt', () => {
        const page = normalizePublishedPage({ id: 1, pagename: 'p', created_at: '2026-02-02' });
        expect(page.updatedAt).toBe('2026-02-02');
    });

    it('заменяет невалидную schema пустой', () => {
        for (const schema of [null, 'text', [], { meta: {} }]) {
            const page = normalizePublishedPage({ id: 1, pagename: 'p', schema });
            expect(page.schema).toEqual({ components: [] });
        }
    });

    it('переживает не-объектный вход', () => {
        const page = normalizePublishedPage(null);
        expect(page.schema).toEqual({ components: [] });
        expect(page.published).toBe(false);
    });

    it('приводит published к boolean', () => {
        expect(normalizePublishedPage({ id: 1, pagename: 'p', published: 1 }).published).toBe(true);
        expect(normalizePublishedPage({ id: 1, pagename: 'p', published: 0 }).published).toBe(
            false
        );
    });
});
