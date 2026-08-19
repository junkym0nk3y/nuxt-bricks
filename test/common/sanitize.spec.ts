// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { sanitizeRichTextHtml } from '../../src/runtime/modules/common/utils/sanitize/sanitizeRichText';
import { sanitizeSvgMarkup } from '../../src/runtime/modules/common/utils/sanitize/sanitizeSvg';
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

        const okLink =
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>';
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

    it('навязывает rel="noopener noreferrer" ссылкам в новую вкладку', () => {
        // Без rel открытая вкладка получает window.opener исходной страницы
        expect(sanitizeRichTextHtml('<a href="https://e.com" target="_blank">x</a>')).toBe(
            '<a href="https://e.com" target="_blank" rel="noopener noreferrer">x</a>'
        );

        // Чужой rel заменяется целиком, а не дополняется
        expect(
            sanitizeRichTextHtml('<a href="https://e.com" target="_blank" rel="nofollow">x</a>')
        ).toBe('<a href="https://e.com" target="_blank" rel="noopener noreferrer">x</a>');

        // Self-closing форму js-xss сохраняет — атрибут не должен уехать за слэш
        expect(sanitizeRichTextHtml('<a href="https://e.com" target="_blank"/>')).toBe(
            '<a href="https://e.com" target="_blank" rel="noopener noreferrer" />'
        );

        // Ссылка в той же вкладке остаётся как есть — rel не про неё
        const sameTab = '<a href="https://e.com" rel="nofollow">x</a>';
        expect(sanitizeRichTextHtml(sameTab)).toBe(sameTab);

        // Экранированный текст не тег: подстановка не должна его трогать
        const escaped = '<p>&lt;a target="_blank"&gt;</p>';
        expect(sanitizeRichTextHtml(escaped)).toBe(escaped);
    });

    it('переживает null/undefined/пустую строку', () => {
        expect(sanitizeRichTextHtml(null)).toBe('');
        expect(sanitizeRichTextHtml(undefined)).toBe('');
        expect(sanitizeRichTextHtml('')).toBe('');
    });
});

describe('sanitizeRichTextHtml: URL-политика src/poster/href (R0.1)', () => {
    it('вырезает poster с javascript:/data:/protocol-relative URL', () => {
        expect(sanitizeRichTextHtml('<video poster="javascript:alert(1)"></video>')).not.toContain(
            'javascript'
        );
        expect(
            sanitizeRichTextHtml('<video poster="data:text/html;base64,x"></video>')
        ).not.toContain('data:');
        expect(sanitizeRichTextHtml('<video poster="//evil.example/x.jpg"></video>')).not.toContain(
            'evil.example'
        );
    });

    it('вырезает protocol-relative URL в src (img/video/source) и href', () => {
        expect(sanitizeRichTextHtml('<img src="//evil.example/x.webp">')).not.toContain(
            'evil.example'
        );
        expect(sanitizeRichTextHtml('<video src="//evil.example/x.mp4"></video>')).not.toContain(
            'evil.example'
        );
        expect(
            sanitizeRichTextHtml('<source src="//evil.example/x.mp4" type="video/mp4">')
        ).not.toContain('evil.example');
        expect(sanitizeRichTextHtml('<a href="//evil.example/x">x</a>')).not.toContain(
            'evil.example'
        );
    });

    it('сохраняет легальные poster/src: https и root-relative', () => {
        const httpsPoster = '<video poster="https://good.example/x.jpg"></video>';
        expect(sanitizeRichTextHtml(httpsPoster)).toBe(httpsPoster);

        const rootRelativePoster = '<video poster="/local/x.jpg"></video>';
        expect(sanitizeRichTextHtml(rootRelativePoster)).toBe(rootRelativePoster);

        const httpsSrc = '<img src="https://cdn.example.com/x.webp">';
        expect(sanitizeRichTextHtml(httpsSrc)).toContain('src="https://cdn.example.com/x.webp"');

        const rootRelativeSrc = '<img src="/media/x.webp">';
        expect(sanitizeRichTextHtml(rootRelativeSrc)).toContain('src="/media/x.webp"');
    });

    it('идемпотентна на второй прогон', () => {
        const html =
            '<p>x</p><video poster="https://good.example/x.jpg" src="/a.mp4"></video>' +
            '<a href="https://e.com" target="_blank">x</a>';
        const once = sanitizeRichTextHtml(html);
        const twice = sanitizeRichTextHtml(once);
        expect(twice).toBe(once);
    });

    it('вырезает backslash-пути, нормализуемые браузером в protocol-relative (/\\host)', () => {
        expect(sanitizeRichTextHtml('<img src="/\\evil.example/x.webp">')).not.toContain(
            'evil.example'
        );
        expect(sanitizeRichTextHtml('<a href="/\\evil.example/x">x</a>')).not.toContain(
            'evil.example'
        );
        expect(
            sanitizeRichTextHtml('<video poster="/\\evil.example/x.jpg"></video>')
        ).not.toContain('evil.example');
        expect(
            sanitizeRichTextHtml('<source src="/\\evil.example/x.mp4" type="video/mp4">')
        ).not.toContain('evil.example');
    });

    it('вырезает entity-энкодинг backslash и слэша в src/href/poster (/&#92;…, /&#47;…)', () => {
        expect(sanitizeRichTextHtml('<img src="/&#92;evil.example/x.webp">')).not.toContain(
            'evil.example'
        );
        expect(sanitizeRichTextHtml('<a href="/&#92;evil.example/x">x</a>')).not.toContain(
            'evil.example'
        );
        expect(
            sanitizeRichTextHtml('<video poster="/&#92;evil.example/x.jpg"></video>')
        ).not.toContain('evil.example');
        // /&#47; декодируется в // — protocol-relative
        expect(sanitizeRichTextHtml('<img src="/&#47;evil.example/x.webp">')).not.toContain(
            'evil.example'
        );
        expect(sanitizeRichTextHtml('<a href="/&#47;evil.example/x">x</a>')).not.toContain(
            'evil.example'
        );
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

describe('sanitizeSvgMarkup: URL-политика fill/stroke/filter/clip-path/mask/style (R0.1)', () => {
    it('вырезает url(javascript:)/url(data:)/url(https:) в fill/stroke', () => {
        expect(
            sanitizeSvgMarkup('<svg><rect fill="url(javascript:alert(1))"/></svg>')
        ).not.toContain('javascript');
        expect(
            sanitizeSvgMarkup('<svg><rect fill="url(data:image/svg+xml,x)"/></svg>')
        ).not.toContain('data:');
        expect(
            sanitizeSvgMarkup('<svg><rect stroke="url(https://evil.example/x)"/></svg>')
        ).not.toContain('evil.example');
    });

    it('вырезает внешний/data: url() в filter/clip-path/mask', () => {
        expect(
            sanitizeSvgMarkup('<svg><g filter="url(https://evil.example/filter.svg#x)"></g></svg>')
        ).not.toContain('evil.example');
        expect(
            sanitizeSvgMarkup('<svg><path clip-path="url(data:image/svg+xml,xxx)"/></svg>')
        ).not.toContain('data:');
        expect(
            sanitizeSvgMarkup('<svg><path mask="url(https://evil.example/m.svg#m)"/></svg>')
        ).not.toContain('evil.example');
    });

    it('вырезает url() с CSS-декларацией внутри style (fill/stroke) — external/data:', () => {
        const external = sanitizeSvgMarkup(
            '<svg><rect style="fill:url(https://evil.example/x)"/></svg>'
        );
        expect(external).not.toContain('evil.example');
        expect(external).not.toContain('url(');

        const dataUrl = sanitizeSvgMarkup(
            '<svg><rect style="fill:url(data:image/svg+xml,x)"/></svg>'
        );
        expect(dataUrl).not.toContain('data:');
    });

    it('вырезает несколько url() в одном значении, если хоть один небезопасен', () => {
        const result = sanitizeSvgMarkup(
            '<svg><rect fill="url(#a), url(https://evil.example)"/></svg>'
        );
        expect(result).not.toContain('evil.example');
    });

    it('вырезает незакрытый url( в fill/stroke/style (fail-closed)', () => {
        expect(
            sanitizeSvgMarkup('<svg><rect fill="url(https://evil.example/x"/></svg>')
        ).not.toContain('evil.example');
        expect(
            sanitizeSvgMarkup('<svg><rect stroke="url(https://evil.example/x"/></svg>')
        ).not.toContain('evil.example');
        expect(
            sanitizeSvgMarkup('<svg><rect style="fill:url(https://evil.example/x"/></svg>')
        ).not.toContain('evil.example');
        // Незакрытый url( без аргумента — тоже отклоняется целиком
        expect(sanitizeSvgMarkup('<svg><rect fill="url("/></svg>')).not.toContain('url(');
    });

    it('вырезает смешанное значение: валидный локальный url() + незакрытый url(', () => {
        const paint = sanitizeSvgMarkup(
            '<svg><rect fill="url(#a) url(https://evil.example/x"/></svg>'
        );
        expect(paint).not.toContain('evil.example');
        expect(paint).not.toContain('url(');

        const style = sanitizeSvgMarkup(
            '<svg><rect style="fill:url(#a);stroke:url(https://evil.example/x"/></svg>'
        );
        expect(style).not.toContain('evil.example');
    });

    it('вырезает незакрытый url( в строгих filter/clip-path/mask', () => {
        expect(sanitizeSvgMarkup('<svg><g filter="url(#blur"></g></svg>')).not.toContain(
            'filter="'
        );
        expect(
            sanitizeSvgMarkup('<svg><path mask="url(https://evil.example/m"/></svg>')
        ).not.toContain('evil.example');
    });

    it('вырезает значение с backslash (потенциальный CSS-escape)', () => {
        const result = sanitizeSvgMarkup('<svg><rect fill="url(\\#grad)"/></svg>');
        expect(result).not.toContain('url(');
    });

    it('вырезает несколько локальных url() в filter/clip-path/mask (разрешена ровно одна)', () => {
        const result = sanitizeSvgMarkup('<svg><rect filter="url(#a) url(#b)"/></svg>');
        expect(result).not.toContain('filter="');
    });

    it('поддерживает регистр/пробелы/кавычки в локальных ссылках без ложных срабатываний', () => {
        expect(sanitizeSvgMarkup('<svg><rect fill="URL(#grad)"/></svg>')).toContain(
            'fill="URL(#grad)"'
        );
        expect(sanitizeSvgMarkup('<svg><rect fill="url( #grad )"/></svg>')).toContain(
            'fill="url( #grad )"'
        );
        expect(sanitizeSvgMarkup(`<svg><rect fill="url('#grad')"/></svg>`)).toContain(
            `fill="url('#grad')"`
        );
    });

    it('сохраняет легальные paint-значения: fill="#fff", stroke="currentColor", filter="url(#blur)"', () => {
        expect(sanitizeSvgMarkup('<svg><rect fill="#fff"/></svg>')).toContain('fill="#fff"');
        expect(sanitizeSvgMarkup('<svg><rect stroke="currentColor"/></svg>')).toContain(
            'stroke="currentColor"'
        );
        expect(sanitizeSvgMarkup('<svg><rect filter="url(#blur)"/></svg>')).toContain(
            'filter="url(#blur)"'
        );
        expect(sanitizeSvgMarkup('<svg><rect mask="none"/></svg>')).toContain('mask="none"');
        expect(sanitizeSvgMarkup('<svg><rect clip-path="url(#c)"/></svg>')).toContain(
            'clip-path="url(#c)"'
        );
    });

    it('вырезает HTML-entity-энкодинг url() в fill/stroke/style (&#40;/&#41;)', () => {
        // js-xss декодирует numeric-энтити (friendlyAttrValue) ПОСЛЕ проверки —
        // политику надо гонять по декодированному значению, иначе обход
        expect(
            sanitizeSvgMarkup('<svg><rect fill="url&#40;https://evil.example&#41;"/></svg>')
        ).not.toContain('evil.example');
        expect(
            sanitizeSvgMarkup('<svg><rect stroke="url&#40;https://evil.example&#41;"/></svg>')
        ).not.toContain('evil.example');
        expect(
            sanitizeSvgMarkup('<svg><rect style="fill:url&#40;https://evil.example&#41;"/></svg>')
        ).not.toContain('evil.example');
        expect(
            sanitizeSvgMarkup('<svg><rect fill="url&#40;javascript:alert(1)&#41;"/></svg>')
        ).not.toContain('javascript');
    });

    it('вырезает hex-entity-энкодинг url() (&#x28;/&#x29;) и энкодинг самого токена url', () => {
        expect(
            sanitizeSvgMarkup('<svg><rect fill="url&#x28;https://evil.example&#x29;"/></svg>')
        ).not.toContain('evil.example');
        // &#117; = 'u' — энкодинг первой буквы токена url тоже не должен пройти
        expect(
            sanitizeSvgMarkup('<svg><rect fill="&#117;rl(https://evil.example)"/></svg>')
        ).not.toContain('evil.example');
    });

    it('вырезает энкодинг одного из нескольких url() (первый локальный, второй encoded external)', () => {
        expect(
            sanitizeSvgMarkup('<svg><rect fill="url(#a) url&#40;https://evil.example&#41;"/></svg>')
        ).not.toContain('evil.example');
    });

    it('полностью очищает encoded hostile ввод за ОДИН прогон (fail-closed, не только на 2-м)', () => {
        // Регресс на bypass: раньше pass 1 пропускал decoded url(), pass 2 срезал.
        // Теперь pass 1 обязан вырезать — сравниваем с двойной санитизацией.
        const encoded = '<svg><rect fill="url&#40;https://evil.example&#41;"/></svg>';
        const once = sanitizeSvgMarkup(encoded);
        expect(once).not.toContain('evil.example');
        expect(once).toBe(sanitizeSvgMarkup(once));
    });

    it('идемпотентна на второй прогон (легальный и hostile ввод)', () => {
        const legal =
            '<svg><rect fill="#fff" stroke="currentColor" filter="url(#blur)" clip-path="url(#c)"/></svg>';
        const legalOnce = sanitizeSvgMarkup(legal);
        expect(sanitizeSvgMarkup(legalOnce)).toBe(legalOnce);

        const hostile =
            '<svg><rect fill="url(javascript:alert(1))" filter="url(https://evil.example/x)"/></svg>';
        const hostileOnce = sanitizeSvgMarkup(hostile);
        expect(sanitizeSvgMarkup(hostileOnce)).toBe(hostileOnce);
    });
});
