// #region Imports
// Types
import type { IBricksPageRow } from '../../src/runtime/modules/common/types/bricks-api';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { toPublicPageProjection } from '../../src/runtime/modules/persistence/server/utils/publicProjection';
// #endregion

/** Полная editorial-строка страницы для проверки проекции. */
function makePageRow(): IBricksPageRow {
    return {
        id: 1,
        pagename: 'landing',
        title: 'Landing',
        description: 'Description',
        keywords: 'a,b',
        backgroundColor: '#fff',
        layout: 'default',
        socialImage: 'https://cdn.example.com/og.webp',
        urlPrefix: 'docs',
        subdomain: null,
        thumbnailUrl: 'https://cdn.example.com/editor-thumbnail.webp',
        viewportConfig: null,
        schema: { components: [] },
        published: true,
        revision: 7,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-10T00:00:00Z',
    };
}

describe('toPublicPageProjection: публичная проекция страницы', () => {
    it('не содержит editor-only полей', () => {
        const projection = toPublicPageProjection(makePageRow());
        expect('thumbnailUrl' in projection).toBe(false);
        expect('revision' in projection).toBe(false);
    });

    it('сохраняет публичные поля рендера', () => {
        const projection = toPublicPageProjection(makePageRow());
        expect(projection.pagename).toBe('landing');
        expect(projection.schema).toEqual({ components: [] });
        expect(projection.urlPrefix).toBe('docs');
        expect(projection.updatedAt).toBe('2026-07-10T00:00:00Z');
    });

    it('не проносит неизвестные поля строки БД (явное перечисление)', () => {
        const row = { ...makePageRow(), internalNote: 'secret' } as IBricksPageRow;
        const projection = toPublicPageProjection(row);
        expect('internalNote' in projection).toBe(false);
    });
});
