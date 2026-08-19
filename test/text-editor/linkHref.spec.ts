// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { normalizeLinkHref } from '../../src/runtime/modules/text-editor/utils/linkHref';
// #endregion

describe('normalizeLinkHref', () => {
    it('дописывает https:// только адресу без явной цели', () => {
        expect(normalizeLinkHref('example.com/a?b=1')).toBe('https://example.com/a?b=1');
        expect(normalizeLinkHref('  example.com  ')).toBe('https://example.com');

        // Схема, якорь и путь от корня — уже явная цель, протокол не дописывается
        expect(normalizeLinkHref('http://example.com')).toBe('http://example.com');
        expect(normalizeLinkHref('mailto:a@example.com')).toBe('mailto:a@example.com');
        expect(normalizeLinkHref('#section')).toBe('#section');
        expect(normalizeLinkHref('/page')).toBe('/page');
    });

    it('отклоняет то, что не пройдёт политику ссылок на рендере', () => {
        expect(normalizeLinkHref('javascript:alert(1)')).toBeNull();
        expect(normalizeLinkHref('//evil.example/x')).toBeNull();
        expect(normalizeLinkHref('   ')).toBeNull();
    });
});
