/**
 * The anchors of the headings of the built-in guide.
 *
 * A link inside an article points at a heading by its slug, and both sides of that
 * have to be built by one rule: the address written in the `.md` is Cyrillic, so a
 * transliterating slug (the one the addresses of published pages are built by) would
 * answer nothing, and a slug leaking between renders would answer `-1` on the second
 * reading of the same article.
 */

// #region Imports
// Markdown
import MarkdownIt from 'markdown-it';

// Vitest
import { describe, expect, it } from 'vitest';

// Anchors
import {
    addDocumentationHeadingAnchors,
    createDocumentationHeadingSlug,
    decodeDocumentationAnchorId,
} from '../../src/runtime/modules/builder/documentation/utils/documentationHeadingAnchors';
// #endregion

// #region Methods
/**
 * Builds the slug of the first heading of a markdown source the way the rule does.
 *
 * @param markdown - The source of the article.
 * @returns The slug of the heading.
 */
function slugOfFirstHeading(markdown: string): string {
    const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
    const tokens = md.parse(markdown, {});
    const headingIndex = tokens.findIndex((token) => token.type === 'heading_open');

    return createDocumentationHeadingSlug(tokens[headingIndex + 1].children);
}

/**
 * The values of the `id` attributes of the markup, in the order they occur.
 *
 * @param html - The markup.
 * @returns The ids.
 */
function collectIds(html: string): string[] {
    return Array.from(html.matchAll(/\sid="([^"]*)"/g), (match) => match[1]);
}
// #endregion

describe('the slug of a heading of the guide', () => {
    it('keeps the Cyrillic of the heading rather than transliterating it', () => {
        // The one link with a fragment the corpus holds today points exactly here:
        // transliteration would give `panel-instrumentov-komponenta` and leave the
        // link of the article pointing at nothing
        expect(slugOfFirstHeading('## Панель инструментов компонента')).toBe(
            'панель-инструментов-компонента'
        );
    });

    it('is built out of the visible text, not the source of the heading', () => {
        // `inline.content` carries the markers themselves — the asterisks, the
        // backticks and the address of the link would all end up in the address of
        // the section
        expect(
            slugOfFirstHeading('## **Bold** text with `code` and [a link](https://e.example)')
        ).toBe('bold-text-with-code-and-a-link');
    });

    it('a picture inside a heading does not decide its address', () => {
        // The content of an `image` token is its alt text: an illustration next to
        // the caption would otherwise become part of the address
        expect(slugOfFirstHeading('## Media ![diagram of the grid](./images/x.png)')).toBe('media');
    });

    it('two spellings of one letter give one slug', () => {
        // The Cyrillic short i as a single code point (U+0439) and as the letter
        // plus a combining breve (U+0438 U+0306) look alike in the article and would
        // give two different ids without the NFKC normalization
        const composed = slugOfFirstHeading('## \u0421\u043b\u043e\u0439');
        const decomposed = slugOfFirstHeading('## \u0421\u043b\u043e\u0438\u0306');

        expect(composed).toBe('слой');
        expect(decomposed).toBe(composed);
    });

    it('punctuation and spaces collapse into single separators', () => {
        expect(slugOfFirstHeading('##   Grid: rows, columns — and gaps!  ')).toBe(
            'grid-rows-columns-and-gaps'
        );
    });

    it('a heading with no letter and no digit still gets an address', () => {
        // A variation selector is a combining mark by its Unicode category, so
        // without the sweep of the invisible characters this heading would take
        // an id made of two selectors and a hyphen: unseen, untypable, unreachable
        expect(slugOfFirstHeading('## \u2733\ufe0f \u2733\ufe0f')).toBe('section');
    });

    it('a heading of one combining mark falls back too', () => {
        // A combining mark passes the separator sweep as a character of its own, so
        // without the test for something readable this heading would take an id that
        // renders as a bare accent — invisible in the address and untypable
        expect(slugOfFirstHeading('## \u0301')).toBe('section');
    });

    it('the readable part is required of the CUT slug, not of the whole one', () => {
        // The only letter stands past the ceiling: a check made before the cut would
        // pass the heading and leave an id of ninety-six invisible marks
        const marks = '\u0301'.repeat(96);

        expect(slugOfFirstHeading(`## ${marks}a`)).toBe('section');
    });

    it('a long heading is cut by code points rather than by UTF-16 units', () => {
        // Every letter here lives outside the basic plane, so a cut by `String.slice`
        // would be free to land between the halves of a surrogate pair and leave a
        // lone one in the id
        const slug = slugOfFirstHeading(`## ${'\u{10400}'.repeat(120)}`);

        expect(Array.from(slug).length).toBe(96);
        expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(slug)).toBe(false);
    });
});

describe('the rule putting the anchors on the headings', () => {
    it('every heading of an article gets an id', () => {
        const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
        addDocumentationHeadingAnchors(md);

        const html = md.render('# Title\n\n## Section\n\n###### Deep\n');

        expect(collectIds(html)).toEqual(['title', 'section', 'deep']);
    });

    it('repeated headings inside one article get ordinals', () => {
        const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
        addDocumentationHeadingAnchors(md);

        const html = md.render('## Repeat\n\n## Repeat\n\n## Repeat\n');

        expect(collectIds(html)).toEqual(['repeat', 'repeat-1', 'repeat-2']);
    });

    it('an ordinal cannot take the address of a heading that carries it in its text', () => {
        const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
        addDocumentationHeadingAnchors(md);

        const html = md.render('## Repeat\n\n## Repeat 1\n\n## Repeat\n');

        // The collision goes the other way round too: the ordinal of the third
        // heading has to step over the address the second one took by its own text
        expect(collectIds(html)).toEqual(['repeat', 'repeat-1', 'repeat-2']);
    });

    it('the ordinals do not leak from one render into the next', () => {
        const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
        addDocumentationHeadingAnchors(md);

        const first = md.render('## Repeat\n\n## Repeat\n');
        const second = md.render('## Repeat\n\n## Repeat\n');

        // The instance of the parser is cached at the module level and lives on
        // between the readings; on the server it is shared by the requests of the
        // whole process, so a set hoisted out of the run would climb over its life
        expect(collectIds(second)).toEqual(collectIds(first));
    });

    it('a heading written as raw HTML travels through untouched', () => {
        const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
        addDocumentationHeadingAnchors(md);

        // The limit is deliberate: a core rule sees the heading tokens of markdown,
        // and raw markup arrives as an `html_block`. The corpus test is what would
        // show a link pointing at such a heading
        expect(md.render('<h2>Raw</h2>\n')).not.toContain('id=');
    });
});

describe('the id a fragment link of an article points at', () => {
    it('a percent-encoded fragment decodes into the id of the heading', () => {
        // markdown-it writes a Cyrillic fragment into the href encoded, while the id
        // of the heading stays readable: comparing the two raw would find nothing
        expect(decodeDocumentationAnchorId('#%D1%81%D0%BB%D0%BE%D0%B9')).toBe('слой');
    });

    it('a broken encoding is not worth losing the link over', () => {
        expect(decodeDocumentationAnchorId('#50%-width')).toBe('50%-width');
    });

    it('a bare fragment sign gives no id at all', () => {
        expect(decodeDocumentationAnchorId('#')).toBe('');
    });
});
