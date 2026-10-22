// #region Imports
// Types
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
// #endregion

// #region Constants
/** Name of the core rule that puts the anchors on the headings */
const ANCHOR_RULE_NAME = 'documentation_heading_anchors';

/** The heading tags an anchor is put on */
const HEADING_TAG = /^h[1-6]$/;

/**
 * Inline tokens the visible text of a heading is assembled from. `inline.content` is
 * not used in their place: it is the SOURCE of the heading, markers and all, so
 * `## **Bold** and \`code\`` would give a slug carrying the asterisks, the backticks
 * and the address of any link. An `image` is left out on purpose — its content is the
 * alt text, and a picture inside a heading must not decide the address of the section.
 */
const SLUG_SOURCE_TOKEN_TYPES = new Set(['text', 'code_inline']);

/**
 * Everything outside a letter, a combining mark and a digit becomes one separator.
 * The classes are Unicode ones rather than ASCII: the guide is written in Russian, and
 * the links inside its articles are Cyrillic — transliterating here (the way
 * `common/utils/slug.ts` does for the addresses of published pages) would produce an
 * id no link of the corpus points at.
 */
const SLUG_SEPARATOR = /[^\p{L}\p{M}\p{N}]+/gu;

/**
 * Invisible code points dropped before the separators are looked for. A variation
 * selector is a combining mark by its category, so an emoji-only heading would
 * otherwise keep the selectors and nothing else — an id made of characters that
 * cannot be seen, typed or pointed at by a link.
 */
const SLUG_INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu;

/** The leading and trailing hyphens left by the separators */
const SLUG_EDGE_HYPHENS = /^-+|-+$/g;

/** Ceiling on the length of a slug, in code points */
const SLUG_MAX_LENGTH = 96;

/**
 * Whether a slug carries anything a reader could see and type. A combining mark
 * passes the separator sweep as a character of its own, so a heading made of one
 * would otherwise take an id that renders as a bare accent.
 */
const SLUG_HAS_CONTENT = /[\p{L}\p{N}]/u;

/** The slug of a heading whose text holds no letter and no digit at all */
const EMPTY_SLUG_FALLBACK = 'section';
// #endregion

// #region Methods
/**
 * Cuts a slug down to the ceiling by code points.
 *
 * The count is over code points rather than UTF-16 units: a cut by `String.slice`
 * would be free to land between the halves of a surrogate pair and leave a lone one
 * in the id.
 *
 * @param slug - The slug to cut.
 * @param maxLength - Ceiling in code points.
 * @returns The slug no longer than the ceiling, with no hyphen left hanging at its end.
 */
function truncateSlug(slug: string, maxLength: number): string {
    const codePoints = Array.from(slug);

    if (codePoints.length <= maxLength) {
        return slug;
    }

    return codePoints.slice(0, maxLength).join('').replace(SLUG_EDGE_HYPHENS, '');
}

/**
 * Builds the slug of a heading out of its inline tokens.
 *
 * The text is normalized (NFKC) ahead of everything else: the Cyrillic short i typed
 * as U+0438 plus a combining breve and the same letter written as U+0439 look alike in
 * the article and would otherwise give two different ids for one heading.
 *
 * @param children - The children of the inline token of the heading.
 * @returns The slug of the heading.
 */
export function createDocumentationHeadingSlug(children: Token[] | null | undefined): string {
    const text = (children ?? [])
        .filter((token) => SLUG_SOURCE_TOKEN_TYPES.has(token.type))
        .map((token) => token.content)
        .join('');

    const slug = truncateSlug(
        text
            .normalize('NFKC')
            .toLowerCase()
            .replace(SLUG_INVISIBLE, '')
            .replace(SLUG_SEPARATOR, '-')
            .replace(SLUG_EDGE_HYPHENS, ''),
        SLUG_MAX_LENGTH
    );

    // The test is over the CUT slug: a heading whose only letter sits past the
    // ceiling would otherwise keep an id of marks and hyphens alone
    return SLUG_HAS_CONTENT.test(slug) ? slug : EMPTY_SLUG_FALLBACK;
}

/**
 * Gives a slug already taken in this article an ordinal suffix.
 *
 * The suffix has to fit UNDER the ceiling rather than push past it, so the base part
 * is shortened by its length; the loop stays because a shortened base can collide in
 * its own turn — and so can a heading whose own text gives `intro-1`.
 *
 * @param slug - The slug built from the text of the heading.
 * @param usedSlugs - The slugs already handed out in this render.
 * @returns A slug unique within the article.
 */
function makeUniqueSlug(slug: string, usedSlugs: Set<string>): string {
    let candidate = slug;
    let ordinal = 0;

    while (usedSlugs.has(candidate)) {
        ordinal += 1;
        const suffix = `-${ordinal}`;
        candidate = `${truncateSlug(slug, SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
    }

    usedSlugs.add(candidate);

    return candidate;
}

/**
 * Registers the rule putting an `id` on every heading of an article.
 *
 * Called once per instance of markdown-it — the instance of the modal is cached at the
 * module level and lives on between renders, so a second registration would hang a
 * second copy of the rule on it.
 *
 * A rule of our own rather than `markdown-it-anchor`: the plugin brings machinery this
 * surface has no use for (a link inside the heading, a `tabindex` of its own) and the
 * parser travels in the lazy chunk of the modal, where a dependency is paid for by
 * everyone who opens the guide.
 *
 * Raw `<h2>` markup written in a `.md` by hand stays without an anchor: a core rule
 * sees the heading tokens of markdown, and raw markup travels through the parser as an
 * `html_block`. The corpus holds no such heading, and the corpus test would show one
 * the moment a link started pointing at it.
 *
 * @param md - The instance of markdown-it the articles are rendered by.
 */
export function addDocumentationHeadingAnchors(md: MarkdownIt): void {
    md.core.ruler.push(ANCHOR_RULE_NAME, (state) => {
        // The set of the slugs handed out belongs to ONE render: hoisted into the
        // closure of the installer it would keep the headings of every article read
        // before, and the second reading of one article would answer `intro-1` — on
        // the server, where the instance is shared by the requests of the process,
        // the ordinals would climb over the whole life of it
        const usedSlugs = new Set<string>();

        state.tokens.forEach((token, index) => {
            if (token.type !== 'heading_open' || !HEADING_TAG.test(token.tag)) {
                return;
            }

            const inline = state.tokens[index + 1];

            if (inline?.type !== 'inline') {
                return;
            }

            const slug = createDocumentationHeadingSlug(inline.children);

            token.attrSet('id', makeUniqueSlug(slug, usedSlugs));
        });
    });
}

/**
 * The id of the heading a fragment link of an article points at.
 *
 * The decoding is not optional: markdown-it writes a Cyrillic fragment into the `href`
 * percent-encoded (`#%D0%BF…`), while the `id` of the heading stays the readable text —
 * comparing the two raw would find nothing. The normalization is the same one the slug
 * is built through, so that the two sides ask one question.
 *
 * @param href - The `href` of the link, fragment sign included.
 * @returns The id of the heading, or an empty string for a bare `#`.
 */
export function decodeDocumentationAnchorId(href: string): string {
    const fragment = href.slice(1);

    try {
        return decodeURIComponent(fragment).normalize('NFKC');
    } catch {
        // A lone `%` is not an encoding error worth losing the link over: the raw
        // fragment is still allowed to match an id
        return fragment.normalize('NFKC');
    }
}
// #endregion
