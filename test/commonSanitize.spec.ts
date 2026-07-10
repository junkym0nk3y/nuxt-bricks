// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { sanitizeRichTextHtml } from '../src/runtime/modules/common/utils/sanitize/sanitizeRichText';
import { sanitizeSvgMarkup } from '../src/runtime/modules/common/utils/sanitize/sanitizeSvg';
// #endregion

describe('sanitizeRichTextHtml: rich-text allow-list', () => {
    it('пропускает TipTap-разметку (cssfilter нормализует пробелы в style)', () => {
        const html =
            '<h2 style="text-align: center">Title</h2>' +
            '<p><strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>' +
            '<ul><li>one</li><li>two</li></ul>' +
            '<blockquote><p>quote</p></blockquote>' +
            '<p><span style="color: #ff0000; font-size: 1.6rem">styled</span></p>';
        const result = sanitizeRichTextHtml(html);

        expect(result).toContain('<h2 style="text-align:center;">Title</h2>');
        expect(result).toContain(
            '<strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s>'
        );
        expect(result).toContain('<ul><li>one</li><li>two</li></ul>');
        expect(result).toContain('<blockquote><p>quote</p></blockquote>');
        expect(result).toContain('<span style="color:#ff0000; font-size:1.6rem;">styled</span>');
    });

    it('вырезает script целиком и незнакомые теги без контента-потерь', () => {
        const html = '<p>safe</p><script>alert(1)</script><custom>text</custom>';
        const result = sanitizeRichTextHtml(html);

        expect(result).toContain('<p>safe</p>');
        expect(result).not.toContain('script');
        expect(result).not.toContain('alert');
        expect(result).toContain('text');
        expect(result).not.toContain('<custom>');
    });

    it('вырезает event-атрибуты и опасные протоколы ссылок', () => {
        expect(sanitizeRichTextHtml('<p onclick="alert(1)">x</p>')).toBe('<p>x</p>');

        const link = sanitizeRichTextHtml('<a href="javascript:alert(1)">x</a>');
        expect(link).not.toContain('javascript');

        const okLink = '<a href="https://example.com" target="_blank" rel="noopener">x</a>';
        expect(sanitizeRichTextHtml(okLink)).toBe(okLink);

        expect(sanitizeRichTextHtml('<a href="#anchor">x</a>')).toBe('<a href="#anchor">x</a>');
        expect(sanitizeRichTextHtml('<a href="/page">x</a>')).toBe('<a href="/page">x</a>');
    });

    it('фильтрует img/video src по протоколу', () => {
        const img = '<img src="https://cdn.example.com/x.webp" alt="a" width="200" height="100">';
        expect(sanitizeRichTextHtml(img)).toContain('src="https://cdn.example.com/x.webp"');

        const evil = sanitizeRichTextHtml('<img src="javascript:alert(1)">');
        expect(evil).not.toContain('javascript');

        const data = sanitizeRichTextHtml('<img src="data:text/html;base64,x">');
        expect(data).not.toContain('data:');
    });

    it('фильтрует CSS вне whitelist (position, background url)', () => {
        const result = sanitizeRichTextHtml(
            '<span style="position: fixed; color: red; background: url(https://evil)">x</span>'
        );
        expect(result).not.toContain('position');
        expect(result).not.toContain('url(');
        expect(result).toContain('color');
    });

    it('переживает null/undefined/пустую строку', () => {
        expect(sanitizeRichTextHtml(null)).toBe('');
        expect(sanitizeRichTextHtml(undefined)).toBe('');
        expect(sanitizeRichTextHtml('')).toBe('');
    });
});

describe('sanitizeSvgMarkup: SVG allow-list', () => {
    it('пропускает статичную векторную графику', () => {
        const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
            '<path d="M0 0h24v24z" fill="currentColor"/>' +
            '<circle cx="12" cy="12" r="6" stroke="#000" stroke-width="2"/>' +
            '</svg>';
        const result = sanitizeSvgMarkup(svg);

        // js-xss нормализует имена атрибутов в lowercase — HTML-парсер браузера
        // восстанавливает канонический регистр SVG-атрибутов (viewBox) при вставке
        expect(result.toLowerCase()).toContain('viewbox="0 0 24 24"');
        expect(result).toContain('d="M0 0h24v24z"');
        expect(result).toContain('fill="currentColor"');
        expect(result).toContain('stroke-width="2"');
    });

    it('вырезает script, style, foreignObject и SMIL-анимации вместе с содержимым', () => {
        const svg =
            '<svg><script>alert(1)</script><style>body{display:none}</style>' +
            '<foreignObject><iframe src="https://evil"></iframe></foreignObject>' +
            '<animate attributeName="href" to="javascript:alert(1)"/>' +
            '<path d="M0 0"/></svg>';
        const result = sanitizeSvgMarkup(svg);

        expect(result).not.toContain('script');
        expect(result).not.toContain('alert');
        expect(result).not.toContain('style');
        expect(result).not.toContain('display:none');
        expect(result).not.toContain('foreignObject');
        expect(result).not.toContain('iframe');
        expect(result).not.toContain('animate');
        expect(result).not.toContain('[removed]');
        expect(result).toContain('d="M0 0"');
    });

    it('вырезает event-атрибуты и внешние href', () => {
        const result = sanitizeSvgMarkup(
            '<svg onload="alert(1)"><use href="https://evil.com/x.svg#a"/><use href="#local"/></svg>'
        );

        expect(result).not.toContain('onload');
        expect(result).not.toContain('evil.com');
        expect(result).toContain('href="#local"');
    });

    it('сохраняет градиенты и clipPath (camelCase-теги)', () => {
        const svg =
            '<svg><defs><linearGradient id="g" x1="0" x2="1">' +
            '<stop offset="0" stop-color="#fff"/></linearGradient>' +
            '<clipPath id="c"><rect x="0" y="0" width="10" height="10"/></clipPath></defs>' +
            '<rect width="24" height="24" fill="url(#g)" clip-path="url(#c)"/></svg>';
        const result = sanitizeSvgMarkup(svg);

        expect(result.toLowerCase()).toContain('lineargradient');
        expect(result).toContain('stop-color="#fff"');
        expect(result.toLowerCase()).toContain('clippath');
        expect(result).toContain('fill="url(#g)"');
    });

    it('фильтрует style-атрибут по CSS-whitelist', () => {
        const result = sanitizeSvgMarkup(
            '<svg><path d="M0 0" style="fill: red; position: fixed"/></svg>'
        );

        expect(result).toContain('fill');
        expect(result).not.toContain('position');
    });

    it('переживает null/undefined/пустую строку', () => {
        expect(sanitizeSvgMarkup(null)).toBe('');
        expect(sanitizeSvgMarkup(undefined)).toBe('');
        expect(sanitizeSvgMarkup('')).toBe('');
    });
});
