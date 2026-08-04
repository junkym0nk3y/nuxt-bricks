// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { TPublishedPageSummary } from '../../src/runtime/modules/common/types/bricks-api';

// Utils
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_LAYOUT,
    matchesPageSubdomain,
    normalizePageVersionPreview,
    normalizePublishedPage,
    normalizePublishedPageSummary,
    preserveSchema,
} from '../../src/runtime/modules/common/utils/bricks/publishedPage';
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

describe('normalizePublishedPageSummary', () => {
    it('нормализует сводку без фабрикации schema/isPreview', () => {
        const summary = normalizePublishedPageSummary({
            id: 7,
            pagename: 'landing',
            url_prefix: 'blog',
            revision: 3,
            published: 1,
        });

        expect(summary.id).toBe(7);
        expect(summary.urlPrefix).toBe('blog');
        expect(summary.revision).toBe(3);
        expect(summary.published).toBe(true);
        expect(summary.backgroundColor).toBe(DEFAULT_BACKGROUND_COLOR);
        expect(summary.layout).toBe(DEFAULT_LAYOUT);
        expect('schema' in summary).toBe(false);
        expect('isPreview' in summary).toBe(false);
    });
});

describe('matchesPageSubdomain: точное сопоставление subdomain', () => {
    it('первый label должен совпасть точно — подстрока не матчится', () => {
        expect(matchesPageSubdomain('promo.example.com', 'promo')).toBe(true);
        expect(matchesPageSubdomain('notpromo.example.com', 'promo')).toBe(false);
        expect(matchesPageSubdomain('promo-x.example.com', 'promo')).toBe(false);
        expect(matchesPageSubdomain('example.com', 'promo')).toBe(false);
    });

    it('порт, регистр и trailing dot нормализуются', () => {
        expect(matchesPageSubdomain('PROMO.example.com:3000', 'promo')).toBe(true);
        expect(matchesPageSubdomain('promo.example.com.', 'Promo')).toBe(true);
    });

    it('subdomain с точками — полное совпадение hostname', () => {
        expect(matchesPageSubdomain('promo.example.com', 'promo.example.com')).toBe(true);
        expect(matchesPageSubdomain('sub.promo.example.com', 'promo.example.com')).toBe(false);
    });

    it('пустой/отсутствующий subdomain — всегда матч, пустой host — нет', () => {
        expect(matchesPageSubdomain('anything.example', null)).toBe(true);
        expect(matchesPageSubdomain('anything.example', '  ')).toBe(true);
        expect(matchesPageSubdomain(undefined, 'promo')).toBe(false);
        expect(matchesPageSubdomain('', 'promo')).toBe(false);
    });
});

describe('normalizePageVersionPreview: тождество страницы поверх снапшота версии', () => {
    it('адрес берётся у текущей строки, а не у снапшота', () => {
        const page = {
            id: 7,
            pagename: 'post',
            urlPrefix: 'news',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-02-01T00:00:00Z',
        } as TPublishedPageSummary;

        // Снимок снят до переноса страницы под другой префикс. Останься его
        // `urlPrefix` — сверка адреса в превью и рендерере отвергла бы страницу
        // как чужую, и вкладка версии показала бы пустой канвас
        const preview = normalizePageVersionPreview(
            { pagename: 'post', url_prefix: 'blog', schema: { components: [] } },
            page
        );

        expect(preview.urlPrefix).toBe('news');
        expect(preview.pagename).toBe('post');
        expect(preview.id).toBe(7);
        expect(preview.isPreview).toBe(true);
        expect(preview.revision).toBeUndefined();
    });
});
