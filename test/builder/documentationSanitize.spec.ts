// #region Imports
// Node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pathe
import { join } from 'pathe';

// Markdown
import MarkdownIt from 'markdown-it';

// Vitest
import { describe, expect, it } from 'vitest';

// Anchors
import {
    addDocumentationHeadingAnchors,
    decodeDocumentationAnchorId,
} from '../../src/runtime/modules/builder/documentation/utils/documentationHeadingAnchors';

// Sanitizer
import {
    isDocumentationCrossLink,
    sanitizeDocumentationHtml,
} from '../../src/runtime/modules/builder/documentation/utils/sanitizeDocumentationHtml';
import { createRichTextHtmlSanitizer } from '../../src/runtime/modules/common/utils/sanitize/sanitizeRichText';
// #endregion

/**
 * An article of the guide travels into `v-html`, and the rule of the project asks
 * for a sanitizer ahead of that unconditionally. The guide has a profile of its own:
 * the base rich-text set knows no tables, and the guide is built on them — while a
 * cut made by a sanitizer is SILENT, there is no error, a piece of the article
 * simply disappears.
 *
 * Hence the two levels here. The corpus run over every article compares the
 * tags, the links and the text before and after — it catches an allow-list too
 * narrow. The unit cases catch the opposite: a profile too wide, one that let
 * executable markup through.
 */

// #region Data
const GUIDE_DIR = fileURLToPath(
    new URL('../../src/runtime/modules/builder/documentation/docs/guide/', import.meta.url)
);

// The same options as useMarkdownRenderer: `html: true`, which means raw markup out
// of a .md travels through the parser untouched. The rule of the anchors is the very
// one the renderer installs — spelling it out a second time here would let the ids of
// the corpus and the ids of the modal drift apart
const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
addDocumentationHeadingAnchors(md);

// The public asset prefix of the module under the `/` baseURL — the one
// useMarkdownRenderer rewrites the relative image paths onto BEFORE the showing
const DOCS_IMAGES_BASE = '/_bricks/docs/guide/images/';
// #endregion

// #region Methods
/**
 * The paths of every article of the guide (both locales).
 *
 * @returns Absolute paths of the `.md` files.
 */
function collectArticlePaths(): string[] {
    return readdirSync(GUIDE_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((locale) =>
            readdirSync(join(GUIDE_DIR, locale.name))
                .filter((name) => name.endsWith('.md'))
                .map((name) => join(GUIDE_DIR, locale.name, name))
        );
}

/**
 * Repeats the pipeline of the modal: the markdown render, the rewrite of the image
 * paths and only then the sanitizer. The order matters: before the rewrite a `src`
 * reads as `./images/…`, and the media policy does not let such a path through — a
 * sanitizer placed earlier would cut every picture of the guide out.
 *
 * @param articlePath - Path of the `.md` file.
 * @returns The markup ahead of the sanitizer.
 */
function renderArticle(articlePath: string): string {
    return md
        .render(readFileSync(articlePath, 'utf8'))
        .replace(/src="(?:\.\/)?images\//g, `src="${DOCS_IMAGES_BASE}`);
}

/**
 * Counts the opening tags of the markup by name.
 *
 * @param html - The markup.
 * @returns The number of occurrences per tag name.
 */
function countTags(html: string): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const match of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/g)) {
        const tag = match[1].toLowerCase();
        counts[tag] = (counts[tag] ?? 0) + 1;
    }

    return counts;
}

/**
 * The values of an attribute in the order they occur.
 *
 * @param html - The markup.
 * @param attribute - Name of the attribute.
 * @returns The values of the attribute.
 */
function collectAttributeValues(html: string, attribute: string): string[] {
    return Array.from(html.matchAll(new RegExp(`\\s${attribute}="([^"]*)"`, 'g')), (m) => m[1]);
}

/**
 * The visible text of the markup: tags stripped, whitespace collapsed.
 *
 * @param html - The markup.
 * @returns The text with no markup.
 */
function extractText(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
// #endregion

describe('documentation sanitizer: the corpus of built-in articles', () => {
    const articlePaths = collectArticlePaths();

    // A walk that found nothing would pass as green — and an empty selection is
    // exactly where a silent cut would go unnoticed
    it('the articles of the guide are found', () => {
        expect(articlePaths.length).toBe(10);
    });

    it.each(articlePaths)('%s survives the sanitizer with no loss', (articlePath) => {
        const rendered = renderArticle(articlePath);
        const sanitized = sanitizeDocumentationHtml(rendered);

        // Tags: a narrow allow-list would cut a whole table out, or its sections,
        // leaving the text of the cells hanging between paragraphs
        expect(countTags(sanitized)).toEqual(countTags(rendered));
        // Links: the cross-links `./NN-name.md` lead around the guide inside the
        // modal, and the base link policy does not let them through
        expect(collectAttributeValues(sanitized, 'href')).toEqual(
            collectAttributeValues(rendered, 'href')
        );
        // Pictures: the paths are rewritten into root-relative ahead of the sanitizer
        expect(collectAttributeValues(sanitized, 'src')).toEqual(
            collectAttributeValues(rendered, 'src')
        );
        expect(extractText(sanitized)).toBe(extractText(rendered));
    });

    it.each(articlePaths)('%s: every anchor of the article points at a heading', (articlePath) => {
        const sanitized = sanitizeDocumentationHtml(renderArticle(articlePath));

        const headingIdList = Array.from(
            sanitized.matchAll(/<h[1-6]\s[^>]*\bid="([^"]*)"/g),
            (match) => match[1]
        );
        const headingIds = new Set(headingIdList);

        // Two headings sharing an id make the navigation of the article silently
        // ambiguous. The rule keeps the generated ones apart by itself, but a
        // heading written as raw HTML carries an id of its own past the rule and
        // through the sanitizer — the corpus is where that would show up
        expect(headingIdList.length).toBe(headingIds.size);

        const anchorTargets = collectAttributeValues(sanitized, 'href')
            .filter((href) => href.startsWith('#'))
            .map(decodeDocumentationAnchorId);

        // The link is compared DECODED: markdown-it writes a Cyrillic fragment into
        // the href percent-encoded, while the id of the heading stays readable
        expect(anchorTargets.filter((target) => !headingIds.has(target))).toEqual([]);
    });

    it('the corpus really does hold an anchor to check', () => {
        // Without this case the walk above would go green on a guide with no
        // fragment links at all — and green is exactly how the broken anchor lived
        const anchors = articlePaths
            .flatMap((articlePath) => collectAttributeValues(renderArticle(articlePath), 'href'))
            .filter((href) => href.startsWith('#'));

        expect(anchors.length).toBeGreaterThan(0);
    });

    it('the corpus really does hold tables and cross-links', () => {
        const allRendered = articlePaths.map(renderArticle).join('\n');

        // Without this case the checks above would go green on a profile with no tables
        expect(countTags(allRendered).table).toBeGreaterThan(0);
        expect(
            collectAttributeValues(allRendered, 'href').some((href) => href.endsWith('.md'))
        ).toBe(true);
    });
});

describe('documentation sanitizer: what the profile does not let through', () => {
    it('an empty article gives an empty string rather than undefined in v-html', () => {
        // The "nothing to sanitize" branch is walked on every opening of the modal:
        // until the first answer arrives `articleContent` is empty
        expect(sanitizeDocumentationHtml('')).toBe('');
        expect(sanitizeDocumentationHtml(null)).toBe('');
        expect(sanitizeDocumentationHtml(undefined)).toBe('');
    });

    it('executable markup is cut out along with its content', () => {
        const sanitized = sanitizeDocumentationHtml(
            '<p>before</p><script>alert(1)</script><iframe src="https://evil.example"></iframe><p>after</p>'
        );

        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('alert(1)');
        expect(sanitized).not.toContain('<iframe');
        expect(sanitized).toContain('before');
        expect(sanitized).toContain('after');
    });

    it('event handlers and javascript links do not arrive', () => {
        const sanitized = sanitizeDocumentationHtml(
            '<img src="/x.png" onerror="alert(1)"><a href="javascript:alert(1)">x</a>'
        );

        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('javascript:');
    });

    it('the link relaxation covers articles alone, not relative paths at large', () => {
        // The profile lets a cross-link between articles through — and nothing
        // beyond it: a relaxation grown into "any relative path" would bring back
        // directory traversal and protocol-relative addresses
        expect(sanitizeDocumentationHtml('<a href="./02-interface.md">x</a>')).toContain(
            'href="./02-interface.md"'
        );
        expect(sanitizeDocumentationHtml('<a href="../../etc/passwd.md">x</a>')).not.toContain(
            'passwd'
        );
        expect(sanitizeDocumentationHtml('<a href="//evil.example/x.md">x</a>')).not.toContain(
            'evil.example'
        );
        expect(sanitizeDocumentationHtml('<a href=".\\evil.example.md">x</a>')).not.toContain(
            'evil.example'
        );
    });

    it('the anchor of a heading survives, and an id anywhere else does not', () => {
        // The cut of an attribute is silent: the heading would stay in place and
        // every fragment link of the guide would lead nowhere
        expect(sanitizeDocumentationHtml('<h2 id="section">x</h2>')).toContain('id="section"');
        expect(sanitizeDocumentationHtml('<h6 id="section">x</h6>')).toContain('id="section"');
        // Headings alone carry it: an id allowed globally would travel into the
        // content of published pages, where nothing produces one
        expect(sanitizeDocumentationHtml('<p id="section">x</p>')).not.toContain('id=');
        expect(sanitizeDocumentationHtml('<span id="section">x</span>')).not.toContain('id=');
    });

    it('the shared profile keeps no id even on a heading', async () => {
        const { sanitizeRichTextHtml } =
            await import('../../src/runtime/modules/common/utils/sanitize/sanitizeRichText');

        expect(sanitizeRichTextHtml('<h2 id="section">x</h2>')).not.toContain('id=');
    });

    it('tables are allowed to the guide and stay forbidden to the shared profile', async () => {
        const { sanitizeRichTextHtml } =
            await import('../../src/runtime/modules/common/utils/sanitize/sanitizeRichText');
        const table = '<table><tbody><tr><td>cell</td></tr></tbody></table>';

        expect(sanitizeDocumentationHtml(table)).toContain('<table>');
        // Widening the shared allow-list would permit tables in the content of
        // published pages too — a decision about the product, not the sanitizer
        expect(sanitizeRichTextHtml(table)).not.toContain('<table>');
        expect(sanitizeRichTextHtml(table)).toContain('cell');
    });

    it('only a local file of the guide counts as a cross-link', () => {
        // One predicate answers both the sanitizer and the click handler of the
        // modal: two spellings of one rule drift in both directions — an external
        // address ending in .md would be intercepted into nowhere, while a local one
        // in upper case the sanitizer keeps would fall through to the browser
        expect(isDocumentationCrossLink('./02-interface.md')).toBe(true);
        expect(isDocumentationCrossLink('02-interface.md')).toBe(true);
        expect(isDocumentationCrossLink('02-INTERFACE.MD')).toBe(true);
        expect(isDocumentationCrossLink('https://example.com/manual.md')).toBe(false);
        expect(isDocumentationCrossLink('../../etc/passwd.md')).toBe(false);
        expect(isDocumentationCrossLink('#anchor')).toBe(false);
    });
});

describe('the sanitizer profile factory: guarantees given to every extension', () => {
    it('an extension cannot allow an event handler', () => {
        // `safeAttrValue` does not remove handlers, it only escapes their value:
        // the allow-list is the ONLY thing keeping them out. An extension that
        // allowed `onclick` would release a live handler into `v-html`
        expect(() => createRichTextHtmlSanitizer({ tags: { p: ['onclick'] } })).toThrow(
            /event handler attribute/
        );
        expect(() => createRichTextHtmlSanitizer({ tags: { td: ['ONERROR'] } })).toThrow(
            /event handler attribute/
        );
    });

    it('widening a tag already in the set takes no attribute away from it', () => {
        // Assigning over the base set would silently take `href` away: the markup
        // would stay and the link would stop leading anywhere
        const widened = createRichTextHtmlSanitizer({ tags: { a: [] } });

        expect(widened('<a href="https://example.com">x</a>')).toContain(
            'href="https://example.com"'
        );
    });

    it('an extension cannot allow an executable or document-level tag', () => {
        // `stripIgnoreTagBody` reaches a tag only while it stays OFF the allow-list:
        // allowing `iframe` would not widen the profile but hand `v-html` a live frame
        expect(() => createRichTextHtmlSanitizer({ tags: { iframe: ['src'] } })).toThrow(
            /executable tag/
        );
        expect(() => createRichTextHtmlSanitizer({ tags: { SCRIPT: [] } })).toThrow(
            /executable tag/
        );
        // `<base>` executes nothing and is refused all the same: it repoints every
        // relative link of the page the fragment lands on
        expect(() => createRichTextHtmlSanitizer({ tags: { base: ['href'] } })).toThrow(
            /executable tag/
        );
    });

    it('an extension cannot allow a URL attribute no policy inspects', () => {
        // The policy of the filter covers `href`, `src` and `poster`; js-xss itself
        // adds `background` and the `url()` of `style`. Everything else would travel
        // through unchecked
        expect(() => createRichTextHtmlSanitizer({ tags: { td: ['srcdoc'] } })).toThrow(
            /unchecked URL attribute/
        );
        expect(() => createRichTextHtmlSanitizer({ tags: { a: ['ping'] } })).toThrow(
            /unchecked URL attribute/
        );
    });

    it('an extension policy widens the paths accepted, never the protocols', () => {
        // The guarantee is given to a policy written a shade too broadly: which
        // protocols are safe is the base profile's decision, and escaping a value
        // does nothing to its scheme
        const laxSanitizer = createRichTextHtmlSanitizer({
            isExtraLinkAllowed: () => true,
        });

        expect(laxSanitizer('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript');
        // Browsers ignore control characters inside a scheme, so a leading trim alone
        // would let this one past
        expect(laxSanitizer('<a href="java&#9;script:alert(1)">x</a>')).not.toContain('script:');
        expect(laxSanitizer('<a href="data:text/html,<b>x</b>">x</a>')).not.toContain('data:');
        // The path the policy actually exists for still arrives
        expect(laxSanitizer('<a href="./02-interface.md">x</a>')).toContain(
            'href="./02-interface.md"'
        );
    });

    it('a value let through by an extension policy is escaped all the same', () => {
        // The profile of the guide lets no quote through, but the contract of the
        // factory promises the same guarantees to EVERY extension: the value goes
        // back past safeAttrValue, and unescaped it would close the href and open an
        // attribute of its own
        const laxSanitizer = createRichTextHtmlSanitizer({
            isExtraLinkAllowed: () => true,
        });

        const sanitized = laxSanitizer('<a href=\'x" onmouseover="alert(1)\'>x</a>');

        // The text stays inside the value — what is harmful is not it but the
        // quote: unescaped it would close the href, and `onmouseover` would become
        // an attribute
        expect(sanitized).not.toContain('onmouseover="');
        expect(sanitized).toContain('&quot;');
    });
});
