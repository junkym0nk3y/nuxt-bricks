// #region Imports
// Utils
import { createRichTextHtmlSanitizer } from '../../../common/utils/sanitize/sanitizeRichText';
// #endregion

// #region Constants
/**
 * A cross-link between articles: `./06-adaptive.md` or `06-adaptive.md`. The modal
 * intercepts a click on such a link and navigates inside itself, so the `href` has to
 * survive the sanitizer — without it the guide falls apart into eight unreachable
 * pages, and silently: the markup stays, only the attribute goes.
 *
 * The pattern is deliberately narrower than "a relative path": one segment of safe
 * characters ending in `.md`, no directory traversal, no backslash (the URL parser of
 * the browser turns one into `/`, which would make `.\\evil.example` a host).
 */
const ARTICLE_CROSS_LINK = /^(?:\.\/)?[a-z0-9][a-z0-9._-]*\.md$/i;

/**
 * Whether an `href` is a cross-link between articles of the guide.
 *
 * The sanitizer and the click handler of the modal ask the SAME question through
 * this one predicate, and they have to: two spellings of it drift in both
 * directions. A handler testing `endsWith('.md')` would swallow an external
 * `https://example.com/manual.md` — the click is cancelled and the navigation finds
 * nothing, so the link simply stops working; and a case-sensitive test would let a
 * local `FILE.MD`, which the sanitizer keeps, fall through to the browser.
 *
 * @param href - The raw `href` of the link.
 * @returns Whether the link leads to another article of the guide.
 */
export function isDocumentationCrossLink(href: string): boolean {
    return ARTICLE_CROSS_LINK.test(href);
}

/**
 * What the markup of the guide holds beyond the base rich-text set.
 *
 * Tables: markdown-it renders the alignment of a column as `style="text-align:…"`,
 * and both the `style` attribute and the `text-align` property are in the base profile
 * already — no attribute of their own is needed.
 *
 * The `id` of a heading is the anchor a fragment link of an article points at
 * (`documentationHeadingAnchors.ts` puts it there). Without it here the cut would be
 * silent in the usual way: the heading stays, the attribute goes, and every link
 * inside an article leads nowhere. Headings alone carry it — an `id` allowed globally
 * would travel into the content of published pages, where nothing produces one.
 */
const DOCUMENTATION_TAGS: Record<string, string[]> = {
    h1: ['id'],
    h2: ['id'],
    h3: ['id'],
    h4: ['id'],
    h5: ['id'],
    h6: ['id'],
    table: [],
    thead: [],
    tbody: [],
    tr: [],
    th: [],
    td: [],
};
// #endregion

/**
 * Sanitizes the HTML of a documentation article ahead of `v-html`.
 *
 * The articles ship inside the package and are read build-time by a glob, so there is
 * no untrusted source today. The sanitizer stands regardless, because the rule of the
 * project is unconditional and because `markdown-it` runs with `html: true`: raw
 * markup in a `.md` travels through untouched, and the boundary that has to hold is
 * the one right in front of `v-html`, not the trust of whoever wrote the file.
 *
 * A profile of its own rather than the base one: the guide is built on markdown
 * tables, and widening the shared allow-list would permit tables in the content of
 * published pages too — a product decision, not a sanitizer detail.
 */
export const sanitizeDocumentationHtml = createRichTextHtmlSanitizer({
    tags: DOCUMENTATION_TAGS,
    isExtraLinkAllowed: isDocumentationCrossLink,
});
