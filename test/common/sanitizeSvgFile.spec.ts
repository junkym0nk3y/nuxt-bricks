/**
 * The sanitized SVG as a standalone file. The output of the sanitizer is stored as the
 * `.svg` of an upload, and a browser reads such a file with the XML parser: there the
 * case of the names matters, and an attribute without a value blanks the whole image.
 * The inline surfaces never showed either, because the HTML parser forgives both.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { Window } from 'happy-dom';
import { sanitizeSvgMarkup } from '../../src/runtime/modules/common/utils/sanitize/sanitizeSvg';
// #endregion

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

/**
 * Parses markup the way a browser reads a standalone `.svg` file.
 *
 * @param markup - Sanitized SVG markup.
 * @returns The parsed document.
 */
function parseAsFile(markup: string) {
    return new new Window().DOMParser().parseFromString(markup, 'image/svg+xml');
}

/**
 * Sanitizes a fragment wrapped into an SVG root.
 *
 * @param inner - Markup inside the root.
 * @returns The sanitized document markup.
 */
function sanitizeInRoot(inner: string): string {
    return sanitizeSvgMarkup(
        `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" viewBox="0 0 10 10">${inner}</svg>`
    );
}

describe('sanitizeSvgMarkup as a standalone file', () => {
    it('keeps the case of the names the XML parser needs', () => {
        const result = sanitizeInRoot(
            '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse">' +
                '<stop offset="0" stop-color="red"/></linearGradient>' +
                '<clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath>' +
                '<pattern id="p" patternContentUnits="objectBoundingBox"><rect width="1" height="1"/></pattern>' +
                '<filter id="f"><feGaussianBlur stdDeviation="2"/></filter></defs>' +
                '<rect width="10" height="10" fill="url(#g)"/>'
        );
        const doc = parseAsFile(result);

        expect(doc.querySelector('parsererror')).toBeNull();
        expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 10 10');
        expect(doc.getElementsByTagName('linearGradient')).toHaveLength(1);
        expect(doc.getElementsByTagName('clipPath')).toHaveLength(1);
        expect(doc.getElementsByTagName('feGaussianBlur')).toHaveLength(1);
        // The tags are checked in the markup too: the lookup by tag name of happy-dom
        // does not tell the case apart even in an XML document
        expect(result).toContain('<linearGradient id="g"');
        expect(result).toContain('</linearGradient>');
        expect(result).toContain('<clipPath id="c"');
        expect(result).toContain('<feGaussianBlur stdDeviation="2" />');
        expect(result).toContain('gradientUnits="userSpaceOnUse"');
        expect(result).toContain('clipPathUnits="objectBoundingBox"');
        expect(result).toContain('patternContentUnits="objectBoundingBox"');
        expect(result).toContain('stdDeviation="2"');
    });

    it('drops an attribute whose value was refused instead of leaving it bare', () => {
        const result = sanitizeInRoot(
            '<use href="https://evil.example/x.svg#a"/>' +
                '<rect width="10" height="10" fill="url(https://evil.example/x)"/>'
        );

        expect(parseAsFile(result).querySelector('parsererror')).toBeNull();
        expect(result).toContain('<use />');
        expect(result).toContain('<rect width="10" height="10" />');
    });

    it('keeps a raster image embedded as a data URI', () => {
        const result = sanitizeInRoot(
            `<image href="${PNG_DATA_URI}" width="10" height="10" preserveAspectRatio="none"/>` +
                `<image xlink:href="data:image/jpeg;base64,/9j/4AAQ" width="5" height="5"/>`
        );
        const doc = parseAsFile(result);
        const images = doc.getElementsByTagName('image');

        expect(doc.querySelector('parsererror')).toBeNull();
        expect(result).toContain(`xmlns:xlink="${XLINK_NS}"`);
        expect(images).toHaveLength(2);
        expect(images[0]?.getAttribute('href')).toBe(PNG_DATA_URI);
        expect(images[0]?.getAttribute('preserveAspectRatio')).toBe('none');
        expect(images[1]?.getAttribute('xlink:href')).toBe('data:image/jpeg;base64,/9j/4AAQ');
    });

    it('refuses every other source of an image', () => {
        const sources = [
            'https://tracker.example/pixel.png',
            '/uploads/logo.png',
            'logo.png',
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
            'data:text/html;base64,PGI+PC9iPg==',
            'javascript:alert(1)',
        ];

        for (const source of sources) {
            const result = sanitizeInRoot(`<image href="${source}" width="1" height="1"/>`);

            expect(result).toContain('<image width="1" height="1" />');
            expect(result).not.toContain('href');
        }
    });

    it('escapes a raw ampersand in a value and keeps the references', () => {
        const result = sanitizeInRoot(
            '<text font-family="Tom & Jerry">A</text><text font-family="Tom &amp; Jerry">B</text>'
        );

        expect(result.match(/font-family="Tom &amp; Jerry"/g)).toHaveLength(2);
        expect(result).not.toContain('&amp;amp;');
    });

    it('keeps the first of two attributes that differ in case alone', () => {
        const result = sanitizeSvgMarkup(
            `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10" viewbox="0 0 20 20"><rect width="1" height="1"/></svg>`
        );

        expect(parseAsFile(result).querySelector('parsererror')).toBeNull();
        expect(result).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">');
        expect(result).not.toContain('0 0 20 20');
    });

    it('escapes a raw ampersand and an undeclared entity in a text', () => {
        const result = sanitizeInRoot(
            '<text>R&D&nbsp;&amp;&lt;&gt;&quot;&apos;&#38;&#x2A;</text><text>&ns_svg;</text>'
        );

        expect(parseAsFile(result).querySelector('parsererror')).toBeNull();
        expect(result).toContain(
            '<text>R&amp;D&amp;nbsp;&amp;&lt;&gt;&quot;&apos;&#38;&#x2A;</text>'
        );
        expect(result).toContain('<text>&amp;ns_svg;</text>');
    });
});
